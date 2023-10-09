const { Tag, User_tag } = require('./models');
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const mecab = require('mecab-ya');
const schedule = require('node-schedule');
var admin = require('firebase-admin');
const { sequelize } = require('./models');

const app = express();
process.env.TZ = 'Asia/Seoul';
app.set('port', process.env.PORT || 10000);

app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

////////////////////////////////////////////////////////////////////////

// FCM SDK 초기화
var serviceAccount = require('/home/ubuntu/nodealarm-7aaf7-firebase-adminsdk-c9akk-a90ef8b816.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

////////////////////////////////////////////////////////////////////////

/*app.get('/push', (req, res, next) => {
  let target_token =
    'et-DZiGgQHOYRZo4UAsw0R:APA91bFS8wEDMepnm9TEakazZ3lNFdoSZVgUJXSNudqxpWKf3HcLyNuenjC6sb9PTa6ctNBaYkR2UwWmtBTLcuTTHPCWE5cK4zOxeaJgHvSXA5RQKEtzuKgwf2Xog3drtHGihvlTMgrH'

  let message = {
    data: {
      title: '푸시알림 테스트',
      body: '푸시알림 테스트합니다.',
      style: '테스트',
    },
    token: target_token,
  }

  admin
    .messaging()
    .send(message)
    .then(function (response) {
      console.log('Successfully sent message: : ', response)
    })
    .catch(function (err) {
      console.log('Error Sending message!!! : ', err)
    })
})*/

////////////////////////////////////////////////////////////////////////

//알림 스케줄
schedule.scheduleJob('*/1 * * * *', async function () {	
  // 현재 요일과 시간 구하기
  const now = new Date();
  const option = { weekday: 'short', locale: 'ko-KR' }
  const currentDay = now.toLocaleDateString('ko-KR', option); // 요일을 문자열로 얻음
  const currentTime = now.getHours() + ':' + now.getMinutes(); // HH:mm 형식의 현재 시간

  // MySQL 쿼리: 해당 요일과 시작 시간과 일치하는 레코드 선택
  const query = `
    SELECT U.Token, UH.Title
    FROM User_habit AS UH
    INNER JOIN User AS U ON UH.USER_ID = U.USER_ID
    WHERE (UH.Day LIKE CONCAT('%', ?, '%') OR UH.Day = ?) 
    AND UH.StartTime = ?
  `;

  try {
    const [results, metadata] = await sequelize.query(query, { replacements: [currentDay, currentDay, currentTime] });

    if (results.length === 0) {
      console.log('No matching records found.');
      return;
    }

    for (const result of results) {
      const token = result.Token;
      const title = result.Title;

      // FCM 메시지 작성
      const message = {
        data: {
          title: '알림',
          body: `일정 시작: ${title}`,
        },
        tokens: [token], // 해당 토큰으로 알림을 전송
      };

      const response = await admin.messaging().sendMulticast(message);
      console.log('Successfully sent message:', response);
    }
  } catch (error) {
    console.error('Error:', error);
  }
});


////////////////////////////////////////////////////////////////////////

//통계 정리 스케줄
schedule.scheduleJob('0 0 0 * * *', async function (){
  try {
    //Tag의 사용자수 파악
    const [tags] = await sequelize.query(`
      SELECT TAG_ID, COUNT(DISTINCT USER_ID) as user_count
      FROM Habit_Tag
      GROUP BY TAG_ID
    `);
    
    for (const { TAG_ID, user_count } of tags) {
      await sequelize.query(`UPDATE Tag
        SET User_Count = ?
        WHERE TAG_ID = ?`, { replacements: [user_count, TAG_ID] });
    }

    //Success_Per를 기준으로 순위를 매김
    await sequelize.query(`SET @rank := 0;`);
    
    await sequelize.query(`UPDATE Tag t
      JOIN (SELECT TAG_ID, (@rank := @rank + 1) AS 'rank'
      	FROM Tag
      	ORDER BY Success_Per DESC) r
      ON t.TAG_ID = r.TAG_ID
      SET t.Rank = r.rank;
    `);

    console.log('User_Count와 Rank가 업데이트 되었습니다.');
  } catch (err) {
    console.error('User_Count와 Rank 업데이트에 실패했습니다.', err);
  }
  try {
    //TAG_ID 별로 RunningDay의 평균을 계산
    const [averages] = await sequelize.query(`
      SELECT ht.TAG_ID, AVG(uh.RunningDay) as avgRunningDay
      FROM Habit_Tag ht
      JOIN User_habit uh ON ht.HABIT_ID = uh.HABIT_ID
      GROUP BY ht.TAG_ID
    `);

    //계산된 평균값을 Tag 테이블에 업데이트
    for (const { TAG_ID, avgRunningDay } of averages) {
      await sequelize.query(`UPDATE Tag
        SET Time_Average = ?
        WHERE TAG_ID = ?`, { replacements: [avgRunningDay, TAG_ID] });
    }

    console.log('Time_Average가 업데이트 되었습니다.');
  } catch (err) {
    console.error('Time_Average 업데이트에 실패했습니다.', err);
  }
});

////////////////////////////////////////////////////////////////////////

//사용자 통계 정리
schedule.scheduleJob('0 0 * * * *', async function (){
  const transaction = await sequelize.transaction();

  try {
    // 사용자 전체 성공률 업데이트
    await sequelize.query(`UPDATE User u
	JOIN ( SELECT uh.USER_ID, 
          COALESCE((SUM(uh.Success) / NULLIF(SUM(uh.Accumulate), 0)) * 100, 0) AS computedSuccess
    	  FROM User_habit uh
    	  GROUP BY uh.USER_ID) cs
	ON u.USER_ID = cs.USER_ID
	SET u.MySuccess = cs.computedSuccess;`, { transaction });

    console.log('MySuccess가 업데이트 되었습니다.');

    // 순위 초기화
    await sequelize.query(`SET @rank := 0;`, { transaction });

    // MyRank 업데이트
    await sequelize.query(`UPDATE User u
      JOIN (SELECT USER_ID, @rank := @rank + 1 
        AS newRank 
        FROM User 
        ORDER BY MySuccess DESC) r 
      ON u.USER_ID = r.USER_ID
      SET u.MyRank = r.newRank;`, { transaction });

    console.log('MyRank가 업데이트 되었습니다.');

    await transaction.commit();
  } catch (err) {
    console.error('MySuccess 혹은 MyRank 업데이트에 실패했습니다.', err);

    await transaction.rollback();
  }
});

////////////////////////////////////////////////////////////////////////

schedule.scheduleJob('*/10 * * * * *', async function (){
  try {
    const currentDay = new Date().getDay();  // 0: 일요일, 1: 월요일, ..., 6: 토요일
    const currentDayStr = ['일', '월', '화', '수', '목', '금', '토'][currentDay]; // Convert number to string (or use your own string)
    

     // Find all users that should update their daily habit
    const [usersHabits] = await sequelize.query(`
      SELECT uh.USER_ID, SUM(uh.Daily) AS dailySum, COUNT(uh.HABIT_ID) AS totalHabits
      FROM User_habit uh
      WHERE uh.Day LIKE :dayPattern
      GROUP BY uh.USER_ID
    `, { replacements: { dayPattern: `%${currentDayStr}%` } });

    // Loop through each user and update their habit status
    for (const { USER_ID, dailySum, totalHabits } of usersHabits) {
    
      const dailySumNumber = Number(dailySum);
      if(dailySumNumber === totalHabits) {  // If all Daily are 1
	// Increment MyPerfectDay and MyRunningPerfectDay
        await sequelize.query(`
          UPDATE User 
          SET MyPerfectDay = MyPerfectDay + 1, 
              MyRunningPerfectDay = MyRunningPerfectDay + 1 
          WHERE USER_ID = :userId
        `, { replacements: { userId: USER_ID } });
      } else {  // If not all Daily are 1
        // Get current MyBestPerfectDay and MyRunningPerfectDay
        const [users] = await sequelize.query(`
          SELECT MyBestPerfectDay, MyRunningPerfectDay 
          FROM User 
          WHERE USER_ID = :userId
        `, { replacements: { userId: USER_ID } });
        
        // If MyRunningPerfectDay > MyBestPerfectDay, update MyBestPerfectDay
        if(users[0].MyRunningPerfectDay > users[0].MyBestPerfectDay) {
          await sequelize.query(`
            UPDATE User 
            SET MyBestPerfectDay = MyRunningPerfectDay, 
                MyRunningPerfectDay = 0
            WHERE USER_ID = :userId
          `, { replacements: { userId: USER_ID } });
        } else {
          // Reset MyRunningPerfectDay to 0
          await sequelize.query(`
            UPDATE User 
            SET MyRunningPerfectDay = 0
            WHERE USER_ID = :userId
          `, { replacements: { userId: USER_ID } });
        }
      }
    }

    console.log('User habit status has been updated.');
  } catch (err) {
    console.error('Failed to update user habit status.', err);
  }
});

////////////////////////////////////////////////////////////////////////


app.post('/user', (req, res) => {   //유저 정보 입력
    const { USER_Name, USER_Email, USER_Password, AccessDate, AccumulateDate, TreeStatus, Token } = req.body;
    const query = `INSERT INTO User (USER_Name, USER_Email, USER_Password, AccessDate, AccumulateDate, TreeStatus, Token) VALUES (?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d'), ?, ?, ?)`;

    sequelize.query(query, { replacements: [USER_Name, USER_Email, USER_Password, AccessDate, AccumulateDate, TreeStatus, Token] })
      .then(() => {
        const selectQuery = `SELECT LAST_INSERT_ID() as USER_ID`;
        return sequelize.query(selectQuery, { plain: true });
      })
      .then((result) => {
        const USER_ID = result.USER_ID;
        res.json({ USER_ID });
      })

      .catch((err) => {
        console.error('Failed to execute query:', err);
        res.status(501).send('User INSERT Error');
      });
});

////////////////////////////////////////////////////////////////////////

app.post('/login', (req, res) => {    //로그인 기능
  const { USER_Email, USER_Password } = req.body;
  const query = `SELECT USER_ID FROM User WHERE USER_Email = ? AND USER_Password = ?`;

  sequelize.query(query, { replacements: [USER_Email, USER_Password], type: sequelize.QueryTypes.SELECT })
    .then((users) => {
      if (users.length > 0) {
        const USER_ID = users[0].USER_ID;
        res.json({ authenticated: true, USER_ID });
      } else {
        res.json({ authenticated: false });
      }
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(500).send('Internal Server Error');
    });
});

////////////////////////////////////////////////////////////////////////


app.post('/user/habit', (req, res) => {    //습관 추가
    const { USER_ID, Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, TargetDate, TargetSuccess } = req.body;
    console.log('Received JSON data:', req.body);

    const query = `
        INSERT INTO User_habit (
            Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, Rate, TargetDate, TargetSuccess, USER_ID
        ) 
        VALUES (?, ?, ?, ?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d'), ?, ?, ?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d'), ?, ?)
    `;
    
    const Rate = (Success / Accumulate) * 100;
    const ERate = isNaN(Rate) ? 0 : Rate;

    mecab.nouns(Title, function(err, result) {
        if (err) {
            console.error('Failed to extract nouns:', err);
            res.status(500).send('Internal Server Error');
            return;
        }
        const extractedNouns = result.join(', ');
        console.log('Extracted Nouns:', extractedNouns);

        sequelize.query(query, {
            replacements: [
                Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, ERate, TargetDate, TargetSuccess, USER_ID
            ],
        })
        .then(() => {
            const selectQuery = 'SELECT LAST_INSERT_ID() as HABIT_ID';
            return sequelize.query(selectQuery, { plain: true });
        })
        .then((result) => {
            const HABIT_ID = result.HABIT_ID;

            if (Schedule !== 0) {
                res.json({ HABIT_ID });
                return;
            }

            // 분리된 명사들을 태그로 추가
            const tags = extractedNouns.split(', ');

            return Promise.all(tags.map(tag => {
                const InsertTag = 'INSERT INTO Tag (Name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM Tag WHERE Name = ?) LIMIT 1';

                return sequelize.query(InsertTag, { replacements: [tag, tag] })
                    .then(() => {
                        const selectTagIdQuery = 'SELECT TAG_ID FROM Tag WHERE Name = ? LIMIT 1';
                        return sequelize.query(selectTagIdQuery, { replacements: [tag], plain: true });
                    })
                    .then(tagResult => {
                        const TAG_ID = tagResult.TAG_ID;

                        const tagQuery = 'INSERT INTO User_tag (USER_ID, HABIT_ID, Tag) VALUES (?, ?, ?)';
                        return sequelize.query(tagQuery, { replacements: [USER_ID, HABIT_ID, tag] })
                            .then(() => {
                                const insertHabitTagQuery = 'INSERT INTO Habit_Tag (USER_ID, HABIT_ID, TAG_ID) VALUES (?, ?, ?)';
                                return sequelize.query(insertHabitTagQuery, { replacements: [USER_ID, HABIT_ID, TAG_ID] });
                            });
                    });
            }))
            .then(() => {
                res.json({ HABIT_ID });
            });
        })
        .catch((err) => {
            console.error('Failed to execute query:', err);
            res.status(502).send('User_habit INSERT Error');
        });
    });
});

////////////////////////////////////////////////////////////////////////

app.post('/renewal', async (req, res) => {      //습관 성공이나 실패
  const { USER_ID, HABIT_ID, isSuccess } = req.body;

  try {
    //isSuccess값에 따라 Success나 Fail에 1을 더함, RunningDay 업데이트
    const updateQuery = `UPDATE User_habit SET ${isSuccess == 1 ? 'Success' : 'Fail'} = ${isSuccess == 1 ? 'Success' : 'Fail'} + 1, Daily = ${isSuccess}, RunningDay = ${isSuccess == 1 ? 'RunningDay + 1' : '0'} WHERE USER_ID = ? AND HABIT_ID = ?`;
    await sequelize.query(updateQuery, { replacements: [USER_ID, HABIT_ID] });

    //Accumulate값 1증가, Rate값 재입력
    const [[{ Success, Accumulate }]] = await sequelize.query(`SELECT Success, Accumulate FROM User_habit WHERE USER_ID = ? AND HABIT_ID = ?`, { replacements: [USER_ID, HABIT_ID] });
    const Rate = (Success / (Accumulate + 1)) * 100;
    await sequelize.query(`UPDATE User_habit SET Accumulate = Accumulate + 1, Rate = ? WHERE USER_ID = ? AND HABIT_ID = ?`, { replacements: [Rate, USER_ID, HABIT_ID] });

    //연관된 Tag에 단체 통계를 위한 값 증가
    const [tags] = await sequelize.query(`SELECT TAG_ID FROM Habit_Tag WHERE HABIT_ID = ?`, { replacements: [HABIT_ID] });
    for (const { TAG_ID } of tags) {
      await sequelize.query(`
        UPDATE Tag SET
        Habit_${isSuccess == 1 ? 'Success' : 'Fail'} = Habit_${isSuccess == 1 ? 'Success' : 'Fail'} + 1,
        Success_Per = (Habit_Success / (Habit_Success + Habit_Fail)) * 100,
        Fail_Per = (Habit_Fail / (Habit_Success + Habit_Fail)) * 100
        WHERE TAG_ID = ?`, { replacements: [TAG_ID] });
    }

    res.send('Data updated successfully');
  } catch (err) {
    console.error('Failed to update data:', err);
    res.status(500).send('Internal Server Error');
  }
});



////////////////////////////////////////////////////////////////////////

app.post('/user/target', (req, res) => {    //목표 수정 기능
  const { USER_ID, HABIT_ID, TargetDate, TargetSuccess } = req.body;
  const query = `UPDATE User_habit SET TargetDate = ?, TargetSuccess = ? WHERE USER_ID = ? AND HABIT_ID = ?`;

  sequelize.query(query, { replacements: [TargetDate, TargetSuccess, USER_ID, HABIT_ID] })
    .then(([result]) => {
      const rowsUpdated = result.affectedRows;
      if (rowsUpdated > 0) {
        res.json({ updated: true, rowsUpdated });
      } else {
        res.json({ updated: false, rowsUpdated });
      }
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(500).send('Internal Server Error');
    });
});

////////////////////////////////////////////////////////////////////////

app.post('/user/habit/modify', (req, res) => {    //습관 수정 기능
  const { USER_ID, HABIT_ID, ...updatedFields } = req.body;

  const updateColumns = Object.keys(updatedFields)
    .filter(col => ['Title', 'Schedule', 'Color', 'StartTime', 'EndTime', 'Day', 'Date', 'Accumulate', 'Daily', 'Success', 'Fail'].includes(col))
    .map(col => {
      if (col === 'Date') {
        return `${col} = STR_TO_DATE(?, '%Y-%m-%d')`;
      }
      return `${col} = ?`;
    })
    .join(', ');

  if (updateColumns === '') {
    res.json({ updated: false, rowsUpdated: 0, message: '업데이트할 필드가 없습니다.' });
    return;
  }

  const query = `UPDATE User_habit SET ${updateColumns} WHERE USER_ID = ? AND HABIT_ID = ?`;

  const replacements = Object.values(updatedFields).map((value, index) => {
    if (Object.keys(updatedFields)[index] === 'Date') {
      return value.replace(" ", "T");
    }
    return value;
  });

  replacements.push(USER_ID, HABIT_ID);

  sequelize.query(query, { replacements })
    .then(([result]) => {
      const rowsUpdated = result.affectedRows;
      if (rowsUpdated > 0) {
        res.json({ updated: true, rowsUpdated });
      } else {
        res.json({ updated: false, rowsUpdated });
      }
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(500).send('Internal Server Error');
    });
});


////////////////////////////////////////////////////////////////////////

app.post('/user/habit/success', (req, res) => {    //성공습관 불러오기
  const { USER_ID } = req.body;
  const query = `SELECT Title, TargetSuccess, Rate, Date as HabitDate FROM User_habit WHERE USER_ID = ? AND Rate >= TargetSuccess`;

  sequelize.query(query, { replacements: [USER_ID], type: sequelize.QueryTypes.SELECT })
    .then((results) => {
      const responseData = results.map((result) => {
        const today = new Date();
        const { HabitDate, ...rest } = result;
        const targetDate = new Date(HabitDate);
        const daysDiff = Math.floor((today - targetDate) / (1000 * 60 * 60 * 24));

        return {
          ...rest,
          DaysSince: daysDiff,
        };
      });
      res.json(responseData);
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(500).send('Internal Server Error');
    });
});

////////////////////////////////////////////////////////////////////////

app.post('/habit/stats', (req, res) => {	//단체 통계 불러오기
  const { USER_ID } = req.body;

  const query = `
    SELECT t.*
    FROM Habit_Tag h
    JOIN Tag t ON h.TAG_ID = t.TAG_ID
    WHERE h.USER_ID = ?;
  `;

  sequelize.query(query, { replacements: [USER_ID] })
    .then(([result]) => {
      if (result.length === 0) {
        console.error('No habit found with given USER_ID');
        return res.status(404).send('Habit not found');
      }

      return res.json({ data: result });
    })
    .catch((err) => {
      console.error('Query Error:', err);
      return res.status(500).send('Internal Server Error');
    });
});

////////////////////////////////////////////////////////////////////////

app.post('/user/stats', async (req, res) => {	//사용자 통계 불러오기
    const { USER_ID } = req.body;
    
    if (!USER_ID) {
        return res.status(400).json({ success: false, message: 'USER_ID is required' });
    }
    
    try {
        const [userStats] = await sequelize.query(`
            SELECT MySuccess, MyRunningPerfectDay, MyBestPerfectDay, MyPerfectDay, MyRank
            FROM User
            WHERE USER_ID = :userId
        `, { replacements: { userId: USER_ID } });
        
        // Check if user stats exist
        if (userStats.length === 0) {
            return res.status(404).json({ success: false, message: 'User stats not found' });
        }

        res.status(200).json({ success: true, data: userStats[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});


////////////////////////////////////////////////////////////////////////

app.get('/habit/rank', async (req, res) => {
    try {
        console.log("Querying database...");  // Log here
        const [tags] = await sequelize.query(`
            SELECT \`Name\`, \`Rank\` FROM \`Tag\`
            WHERE \`Rank\` IS NOT NULL AND \`Rank\` BETWEEN 1 AND 5
            ORDER BY \`Rank\` ASC
        `);
        console.log("Query successful!");  // Log here
        res.status(200).json({ success: true, data: tags });
    } catch (err) {
        console.error("Error occurred:", err);  // Log here
        res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
});


////////////////////////////////////////////////////////////////////////

app.post('/user/habit/delete', (req, res) => {    //습관삭제 기능
  const { USER_ID, HABIT_ID } = req.body;
  const query = `DELETE FROM User_habit WHERE USER_ID = ? AND HABIT_ID = ?`;

  sequelize.query(query, { replacements: [USER_ID, HABIT_ID] })
    .then(([result]) => {
      res.json({ message: '습관삭제에 성공했습니다' }); // 습관 삭제 성공 메세지 전송
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(500).send('Internal Server Error');
    });
});

////////////////////////////////////////////////////////////////////////

app.post('/user/find', (req, res) => {   //친구 찾기
  const { USER_Name } = req.body;
  const usercheck = `SELECT USER_ID, USER_NAME FROM User WHERE USER_Name LIKE ?`;
  console.log('Received JSON data:', req.body); // JSON 데이터 출력

  sequelize.query(usercheck, { replacements: [`%${USER_Name}%`], type: sequelize.QueryTypes.SELECT })
    .then((users) => {
      if (users.length === 0) {
        res.status(404).send('사용자가 존재하지 않습니다.');
      } else {
        res.json(users);
      }
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(503).send('Internal Server Error');
    });
});

////////////////////////////////////////////////////////////////////////

app.post('/user/fol', (req, res) => {   //친구 추가,삭제 기능
  const { USER_ID, FOL_ID, DELETE } = req.body;
  console.log('Received JSON data:', req.body); // JSON 데이터 출력

  if (DELETE === 0) {
    // 친구를 추가하는 경우
    const addFriendQuery = `INSERT INTO Follow (USER_ID, Target_ID, Follow_Date) VALUES (?, ?, NOW())`;
    sequelize.query(addFriendQuery, { replacements: [USER_ID, FOL_ID] })
      .then(() => {
        res.json({ message: '친구가 추가되었습니다.' }); // 친구 추가 성공 메세지 전송
      })
      .catch((err) => {
        console.error('친구 추가에 실패했습니다:', err);
        res.status(500).send('친구 추가에 실패했습니다');
      });
  } 
  else if (DELETE === 1) {
    // 친구를 삭제하는 경우
    const deleteFriendQuery = `DELETE FROM Follow WHERE USER_ID = ? AND Target_ID = ?`;
    sequelize.query(deleteFriendQuery, { replacements: [USER_ID, FOL_ID] })
      .then((result) => {
        if (result[0].affectedRows > 0) {
          res.json({ message: '친구목록에서 삭제되었습니다.' }); // 친구 삭제 성공 메세지 전송
        } else {
          res.status(400).send('친구를 찾을 수 없습니다');
        }
      })
      .catch((err) => {
        console.error('친구 삭제에 실패했습니다:', err);
        res.status(500).send('친구 삭제에 실패했습니다');
      });
  } else {
    res.status(400).send('잘못된 DELETE 속성 값입니다');
  }
});


////////////////////////////////////////////////////////////////////////

app.get('/info', (req, res) => {   ///info?USER_ID=<사용자 ID> 이렇게 보내줘야됨
  const { USER_ID } = req.query;
  const query = `SELECT HABIT_ID, Title, Schedule, Color, StartTime, EndTime, Day, TargetDate, TargetSuccess FROM User_habit WHERE USER_ID = ?`;

  sequelize.query(query, { replacements: [USER_ID], type: sequelize.QueryTypes.SELECT })
    .then((results) => {
      res.json(results);
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(504).send('Internal Server Error');
    });
})

////////////////////////////////////////////////////////////////////////

app.get('/follow', (req, res) => {   ///내가 팔로우한 사람 찾기
  const { USER_ID } = req.query;
  const query = `SELECT Target_ID FROM Follow WHERE USER_ID = ?`;

  sequelize.query(query, { replacements: [USER_ID], type: sequelize.QueryTypes.SELECT })
    .then((results) => {
      // 결과로 받은 Target_ID들을 배열로 추출
      const targetIDs = results.map(result => result.Target_ID);
      
      // User 테이블에서 해당 Target_ID들에 해당하는 USER_Name을 가져오기 위한 쿼리
      const userQuery = `SELECT USER_ID, USER_Name FROM User WHERE USER_ID IN (?)`;
      
      sequelize.query(userQuery, { replacements: [targetIDs], type: sequelize.QueryTypes.SELECT })
        .then((userResults) => {
          // userResults에는 USER_ID와 USER_Name이 포함된 결과가 있음
          res.json(userResults);
        })
        .catch((err) => {
          console.error('Failed to execute user query:', err);
          res.status(504).send('Internal Server Error');
        });
    })
    .catch((err) => {
      console.error('Failed to execute follow query:', err);
      res.status(504).send('Internal Server Error');
    });
});

////////////////////////////////////////////////////////////////////////

app.get('/follower', (req, res) => {   ///나를 팔로우한 사람 찾기
  const { USER_ID } = req.query;
  const query = `SELECT U.USER_ID, U.USER_Name FROM Follow F JOIN User U ON F.USER_ID = U.USER_ID WHERE F.Target_ID = ?`;

  sequelize.query(query, { replacements: [USER_ID], type: sequelize.QueryTypes.SELECT })
    .then((results) => {
      res.json(results);
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(504).send('Internal Server Error');
    });
})

////////////////////////////////////////////////////////////////////////


app.use((req, res, next) => {
  const error = new Error(`${req.method} ${req.url} 라우터가 없습니다.`);
  error.status = 404;
  next(error);
});

app.use((err, req, res, next) => {
  res.locals.message = err.message;
  res.locals.error = process.env.NODE_ENV !== 'production' ? err : {};
  res.status(err.status || 500).send(err.message);
});

app.listen(app.get('port'), () => {
  console.log(app.get('port'), '번 포트에서 대기 중');
});

sequelize.sync({ force: false })    //데이터베이스 동기화
  .then(() => {
    console.log('데이터베이스 동기화 완료.');
  })
  .catch((err) => {
    console.error('데이터베이스 동기화 실패:', err);
  });


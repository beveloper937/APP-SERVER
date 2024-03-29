const { Tag, User_tag } = require('./models');
const express = require('express');
const nunjucks = require('nunjucks');
const path = require('path');
const morgan = require('morgan');
const mecab = require('mecab-ya');
const schedule = require('node-schedule');
var admin = require('firebase-admin');
const { sequelize } = require('./models');

const app = express();

nunjucks.configure('views', {
   autoescape: true,
   express: app
})

app.set('view engine', 'njk');
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

function getDayFieldPrefix(currentDay) {
  switch(currentDay) {
    case 0: return 'Sun';
    case 1: return 'Mon';
    case 2: return 'Tue';
    case 3: return 'Wed';
    case 4: return 'Thu';
    case 5: return 'Fri';
    case 6: return 'Sat';
    default: throw new Error('Invalid day');
  }
}


////////////////////////////////////////////////////////////////////////

app.get('/', (req, res) => {
    res.render('index');  // `views` 폴더 내의 `index.njk` 파일을 렌더링
});


////////////////////////////////////////////////////////////////////////


//알림 스케줄(1분마다 스케줄)
schedule.scheduleJob('*/1 * * * *', async function () {  
  // 현재 요일과 시간 구하기
  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTimeString = `${currentHours}:${currentMinutes < 10 ? '0' : ''}${currentMinutes}`; // HH:mm 형식의 현재 시간

  // 현재 요일을 문자열로 얻음 (예: 'Mon', 'Tue', ...)
  const currentDay = now.toLocaleDateString('ko-KR', { weekday: 'short' });

  // MySQL 쿼리: 해당 요일과 알람/시작 시간과 일치하는 레코드 선택
  const query = `
    SELECT U.Token, UH.Title, UH.AlarmTime, UH.StartTime
    FROM User_habit AS UH
    INNER JOIN User AS U ON UH.USER_ID = U.USER_ID
    WHERE UH.Day LIKE CONCAT('%', ?, '%')
    AND (UH.AlarmTime = ? OR UH.StartTime = ?)
  `;

  try {
    const [results] = await sequelize.query(query, { replacements: [currentDay, currentTimeString, currentTimeString] });

    if (results.length === 0) {
      console.log('No matching records found.');
      return;
    }

    let messages = [];

    // 각 레코드에 대한 알림 메시지 준비
    for (const result of results) {
      let bodyMessage = result.AlarmTime === currentTimeString ? 
        `${result.Title}을 준비할 시간입니다.` : 
        `${result.Title}을 시작할 시간입니다.`;

      messages.push({
        data: {
          title: '습관 알림',
          body: bodyMessage,
          habitTitle: result.Title,
          // 추가 데이터 필요 시 여기에 포함
        },
        token: result.Token,
      });
    }

    // 메시지 전송
    if (messages.length > 0) {
      const response = await admin.messaging().sendAll(messages);
      console.log('Successfully sent messages:', response);
    }
  } catch (error) {
    console.error('Error:', error);
  }
});

////////////////////////////////////////////////////////////////////////

//통계 정리 스케줄(1시간마다 스케줄)
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

//사용자 Rank와 사용자 전체 성공률  정리(00:00분에 스케줄)
schedule.scheduleJob('0 50 23 * * *', async function (){
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

//사용자 습관 추적(23:59분에 스케줄)
schedule.scheduleJob('0 59 23 * * *', async function (){
  try {
    const currentDay = new Date().getDay();  // 0: 일요일, 1: 월요일, ..., 6: 토요일
    const currentDayStr = ['일', '월', '화', '수', '목', '금', '토'][currentDay]; // Convert number to string (or use your own string)
    const dayPrefix = getDayFieldPrefix(currentDay);

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
      // Field to update in Week_Habit based on the result
      const updateField = dailySumNumber === totalHabits ? `${dayPrefix}_S` : `${dayPrefix}_F`;

      // Update Week_Habit table
      await sequelize.query(`
        UPDATE Habit_Week 
        SET ${updateField} = ${updateField} + 1
        WHERE USER_ID = :userId
      `, { replacements: { userId: USER_ID } });


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

app.post('/user', (req, res) => {	//유저 생성
    const { USER_Name, USER_Email, USER_Password, AccessDate, AccumulateDate, Token } = req.body;
    const query = `INSERT INTO User (USER_Name, USER_Email, USER_Password, AccessDate, AccumulateDate, Token) VALUES (?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d'), ?, ?)`;

    sequelize.query(query, { replacements: [USER_Name, USER_Email, USER_Password, AccessDate, AccumulateDate, Token] })
        .then(() => {
            const selectQuery = `SELECT LAST_INSERT_ID() as USER_ID`;
            return sequelize.query(selectQuery, { type: sequelize.QueryTypes.SELECT });
        })
        .then((result) => {
            const USER_ID = result[0].USER_ID;

            // Habit_Week 추가
            const habitWeekQuery = `INSERT INTO Habit_Week (USER_ID) VALUES (?)`;

            return sequelize.query(habitWeekQuery, { replacements: [USER_ID] })
                .then(() => ({ USER_ID })); // Returning USER_ID for the next then block
        })
        .then(({ USER_ID }) => {
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
  const query = `SELECT USER_ID, USER_Name AS "USER_NAME" FROM User WHERE USER_Email = ? AND USER_Password = ?`;

  sequelize.query(query, { replacements: [USER_Email, USER_Password], type: sequelize.QueryTypes.SELECT })
    .then((users) => {
      if (users.length > 0) {
        const { USER_ID, USER_NAME } = users[0];
        res.json({ authenticated: true, USER_ID, USER_NAME });
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
    const { USER_ID, Title, Schedule, Color, AlarmTime, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, TargetDate, TargetSuccess } = req.body;
    console.log('Received JSON data:', req.body);

    const query = `
        INSERT INTO User_habit (
            Title, Schedule, Color, AlarmTime, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, Rate, TargetDate, TargetSuccess, USER_ID
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d'), ?, ?, ?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d'), ?, ?)
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
                Title, Schedule, Color, AlarmTime, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, ERate, TargetDate, TargetSuccess, USER_ID
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

app.post('/renewal', async (req, res) => {	//습관 업데이트와 취소
  const { USER_ID, HABIT_ID, isSuccess, isCancel } = req.body;	//isSuccess가 1이면 성공, 0이면 실패 //isCancel이 1이면 습관 취소, 0이면 isSuccess값에 따라서 로직 수행

  try {
   
    const [[{ Success, Accumulate }]] = await sequelize.query(`SELECT Success, Accumulate FROM User_habit WHERE USER_ID = ? AND HABIT_ID = ?`, { replacements: [USER_ID, HABIT_ID] });

    const result = await sequelize.transaction(async (t) => {
     
      if (isCancel == 1) {
        // 취소 로직
        const [[{ Daily }]] = await sequelize.query(`SELECT Daily FROM User_habit WHERE USER_ID = ? AND HABIT_ID = ?`, { replacements: [USER_ID, HABIT_ID], transaction: t });
	  
	  if (Daily == 1) {  // 성공 취소할 때, Level 로직
          const [[{ CurrentEXP, Level, NextEXP }]] = await sequelize.query(`SELECT CurrentEXP, Level, NextEXP FROM User WHERE USER_ID = ?`, { replacements: [USER_ID], transaction: t });
          let newEXP = CurrentEXP - 50;
          let newLevel = Level;
          if (newEXP < 0 && newLevel > 1) {
            newLevel--;
            newEXP += 100 * newLevel;
          } else if (newEXP < 0){
	    newEXP = 0;
	  }
          let newNextEXP = 100 * newLevel; 
          await sequelize.query(`UPDATE User SET CurrentEXP = ?, Level = ?, NextEXP = ? WHERE USER_ID = ?`, { replacements: [newEXP, newLevel, newNextEXP, USER_ID], transaction: t });
        }

        await sequelize.query(`
          UPDATE User_habit
          SET ${Daily == 0 ? 'Fail' : 'Success'} = ${Daily == 0 ? 'Fail' : 'Success'} - 1, 
              Accumulate = Accumulate - 1,
	      RunningDay = RunningDay - 1,
              Daily = B_Daily, B_Daily = BB_Daily, BB_Daily = 0
          WHERE USER_ID = ? AND HABIT_ID = ?`, 
        { replacements: [USER_ID, HABIT_ID], transaction: t });

        const [tags] = await sequelize.query(`SELECT TAG_ID FROM Habit_Tag WHERE HABIT_ID = ?`, { replacements: [HABIT_ID], transaction: t });
        for (const { TAG_ID } of tags) {
          await sequelize.query(`
	    UPDATE Tag SET
            Habit_${Daily == 0 ? 'Fail' : 'Success'} = Habit_${Daily == 0 ? 'Fail' : 'Success'} - 1,
            Success_Per = CASE WHEN (Habit_Success + Habit_Fail) = 0 THEN 0 ELSE (Habit_Success / (Habit_Success + Habit_Fail)) * 100 END,
            Fail_Per = CASE WHEN (Habit_Success + Habit_Fail) = 0 THEN 0 ELSE (Habit_Fail / (Habit_Success + Habit_Fail)) * 100 END
            WHERE TAG_ID = ?`, { replacements: [TAG_ID], transaction: t });
       }
      } else {

	  if (isSuccess == 1) {	//성공했을때, Level 로직
          const [[{ CurrentEXP, Level, NextEXP }]] = await sequelize.query(`SELECT CurrentEXP, Level, NextEXP FROM User WHERE USER_ID = ?`, { replacements: [USER_ID], transaction: t });
          let newEXP = CurrentEXP + 50;
          let newLevel = Level;
          if (newEXP >= NextEXP) {
            newLevel++;
            newEXP -= NextEXP;
          }
          let newNextEXP = 100 * newLevel;
          await sequelize.query(`UPDATE User SET CurrentEXP = ?, Level = ?, NextEXP = ? WHERE USER_ID = ?`, { replacements: [newEXP, newLevel, newNextEXP, USER_ID], transaction: t });
        }

	// 업데이트 로직
        await sequelize.query(`UPDATE User_habit SET BB_Daily = B_Daily, B_Daily = Daily WHERE USER_ID = ? AND HABIT_ID = ?`, { replacements: [USER_ID, HABIT_ID], transaction: t });

        await sequelize.query(`UPDATE User_habit SET ${isSuccess == 1 ? 'Success' : 'Fail'} = ${isSuccess == 1 ? 'Success' : 'Fail'} + 1, Daily = ${isSuccess}, RunningDay = ${isSuccess == 1 ? 'RunningDay + 1' : '0'} WHERE USER_ID = ? AND HABIT_ID = ?`, { replacements: [USER_ID, HABIT_ID], transaction: t });
	
	const newSuccess = isSuccess == 1 ? Success + 1 : Success; // 현재의 Success 값에 1을 더하거나 그대로 유지
	const newAccumulate = Accumulate + 1; // 현재의 Accumulate 값에 1을 더함
	const Rate = (newSuccess / newAccumulate) * 100;

	await sequelize.query(`UPDATE User_habit SET Accumulate = ?, Rate = ? WHERE USER_ID = ? AND HABIT_ID = ?`, { replacements: [newAccumulate, Rate, USER_ID, HABIT_ID], transaction: t });


        const [tags] = await sequelize.query(`SELECT TAG_ID FROM Habit_Tag WHERE HABIT_ID = ?`, { replacements: [HABIT_ID], transaction: t });
        for (const { TAG_ID } of tags) {
          await sequelize.query(`
            UPDATE Tag SET
            Habit_${isSuccess == 1 ? 'Success' : 'Fail'} = Habit_${isSuccess == 1 ? 'Success' : 'Fail'} + 1,
            Success_Per = CASE WHEN (Habit_Success + Habit_Fail) = 0 THEN 0 ELSE (Habit_Success / (Habit_Success + Habit_Fail)) * 100 END,
            Fail_Per = CASE WHEN (Habit_Success + Habit_Fail) = 0 THEN 0 ELSE (Habit_Fail / (Habit_Success + Habit_Fail)) * 100 END
            WHERE TAG_ID = ?`, { replacements: [TAG_ID], transaction: t });
        }
      }
    });

    res.send('Data updated successfully');
  } catch (err) {
    console.error('Failed to update data:', err);
    res.status(500).send('Internal Server Error');
  }
});

////////////////////////////////////////////////////////////////////////

app.post('/user/target', (req, res) => {    //목표 수정 기능
  const { USER_ID, HABIT_ID, TargetDate, TargetSuccess, AlarmTime } = req.body;
  console.log(req.body);
  const query = `UPDATE User_habit SET TargetDate = ?, TargetSuccess = ?, AlarmTime = ? WHERE USER_ID = ? AND HABIT_ID = ?`;

  sequelize.query(query, { replacements: [TargetDate, TargetSuccess, AlarmTime, USER_ID, HABIT_ID] })
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
  const query = `SELECT Title, TargetSuccess, Rate, Date as HabitDate FROM User_habit WHERE USER_ID = ? AND Rate >= TargetSuccess AND TargetDate <= CURDATE() AND Schedule = 0`;

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

app.post('/user/habit/fail', (req, res) => {    //실패습관 불러오기
  const { USER_ID } = req.body;
  const query = `SELECT Title, TargetSuccess, Rate, Date as HabitDate FROM User_habit WHERE USER_ID = ? AND Rate < TargetSuccess AND TargetDate <= CURDATE() AND Schedule = 0`;

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

app.post('/habit/org/stats', async (req, res) => {        
    try {
        const { USER_ID } = req.body;

        // 1. MySuccess 값을 가져오기
        const [user] = await sequelize.query(`
            SELECT MySuccess, MyRunningPerfectDay FROM User WHERE USER_ID = ?
        `, { replacements: [USER_ID], type: sequelize.QueryTypes.SELECT });

        // 2. 전체 습관 성공률 계산하기
        const [orgSuccess] = await sequelize.query(`
            SELECT (SUM(Success)/SUM(Accumulate))*100 AS Org_Success FROM User_habit
        `, { type: sequelize.QueryTypes.SELECT });

        // 3. 전체 사용자 수와 해당 유저의 Rank 가져오기
        const [orgUser] = await sequelize.query(`
            SELECT COUNT(*) AS Org_User FROM User
        `, { type: sequelize.QueryTypes.SELECT });
        
        const [userRank] = await sequelize.query(`
            SELECT MyRank FROM User WHERE USER_ID = ?
        `, { replacements: [USER_ID], type: sequelize.QueryTypes.SELECT });

        // 4. 사용자들의 평균 연속 성공일 계산하기
        const [orgAvgRunningDay] = await sequelize.query(`
            SELECT AVG(MyRunningPerfectDay) AS Org_AvgRunningDay FROM User
        `, { type: sequelize.QueryTypes.SELECT });

        // 5. MyRunningPerfectDay 가져오기
        // 사용 위의 user 변수를 사용합니다.

        // 6. Rank 1~5까지의 Name과 Rank 가져오기
        const tags = await sequelize.query(`
    	    SELECT \`Name\`, \`Rank\` FROM \`Tag\` WHERE \`Rank\` IS NOT NULL AND \`Rank\` BETWEEN 1 AND 5 ORDER BY \`Rank\` ASC
	`, { type: sequelize.QueryTypes.SELECT });

	console.log(tags);
        // Response 구성하기
        res.status(200).json({
            MySuccess: user.MySuccess,
            Org_Success: orgSuccess.Org_Success,
            User_Rank: userRank.MyRank,
            Org_User: orgUser.Org_User,
            Org_AvgRunningDay: orgAvgRunningDay.Org_AvgRunningDay,
            MyRunningPerfectDay: user.MyRunningPerfectDay,
            TopTags: tags
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});


////////////////////////////////////////////////////////////////////////

app.post('/habit/user/stats', async (req, res) => {           
    try {
        const { USER_ID } = req.body;

        // 1. USER_ID로 Habit_Week 테이블에 조인하고, 각 요일별 계산
        const [weekStats] = await sequelize.query(`
            SELECT 
                COALESCE((Mon_S / NULLIF(Mon_S + Mon_F, 0)) * 100, 0) AS Mon, 
		COALESCE((Tue_S / NULLIF(Tue_S + Tue_F, 0)) * 100, 0) AS Tue,
		COALESCE((Wed_S / NULLIF(Wed_S + Wed_F, 0)) * 100, 0) AS Wed,
		COALESCE((Thu_S / NULLIF(Thu_S + Thu_F, 0)) * 100, 0) AS Thu,
		COALESCE((Fri_S / NULLIF(Fri_S + Fri_F, 0)) * 100, 0) AS Fri,
		COALESCE((Sat_S / NULLIF(Sat_S + Sat_F, 0)) * 100, 0) AS Sat,
		COALESCE((Sun_S / NULLIF(Sun_S + Sun_F, 0)) * 100, 0) AS Sun
           FROM Habit_Week
            WHERE USER_ID = ?
        `, { replacements: [USER_ID], type: sequelize.QueryTypes.SELECT });

        // 2. USER_ID에 연결된 User_habit테이블에서 모든 HABIT_ID 찾아서 Title, Rate, 그리고 연관된 TAG의 Success_Per, USER_COUNT 가져오기
        const habits = await sequelize.query(`
             SELECT uh.Title, uh.Rate, 
	     JSON_ARRAYAGG(JSON_OBJECT('Name', t.Name, 'Success_Per', t.Success_Per, 'USER_COUNT', t.USER_COUNT)) AS Tags
	     FROM User_habit uh 
	     LEFT JOIN Habit_Tag ht ON uh.HABIT_ID = ht.HABIT_ID 
	     LEFT JOIN Tag t ON ht.TAG_ID = t.TAG_ID
	     WHERE uh.USER_ID = ?
	     GROUP BY uh.Title, uh.Rate;
	`, { replacements: [USER_ID], type: sequelize.QueryTypes.SELECT });

        // Response 구성하기
        res.status(200).json({
            weekStats,
            habits
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});



////////////////////////////////////////////////////////////////////////

app.post('/user/calendar', async (req, res) => {
    try {
        const { USER_ID } = req.body;
	
        // User 테이블에서 MyPerfectDay, MyRunningPerfectDay, MyBestPerfectDay 조회
        const [result] = await sequelize.query(`SELECT MyPerfectDay, MyRunningPerfectDay, MyBestPerfectDay FROM User WHERE USER_ID = ?`, { replacements: [USER_ID], type: sequelize.QueryTypes.SELECT});
	const responseData = { data: result };
	
        res.status(200).json({ data:result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error'});
    }
});


////////////////////////////////////////////////////////////////////////

app.post('/user/recap', async (req, res) => {
  try {
    const { USER_ID } = req.body;

    // 1. 가장 높은 Rate를 가진 Title 3개를 가져옵니다.
    const [topRatedTitles] = await sequelize.query(`
      SELECT Title, Rate FROM User_habit 
      WHERE USER_ID = ? AND Schedule = 0
      ORDER BY Rate DESC 
      LIMIT 3
    `, { replacements: [USER_ID] });

    // 2. (EndTime - StartTime) * Success가 가장 높은 순서대로 Title 3개를 가져옵니다.
    const [topDurationTitles] = await sequelize.query(`
      SELECT Title,
             (HOUR(EndTime) * 60 + MINUTE(EndTime) - (HOUR(StartTime) * 60 + MINUTE(StartTime))) * Success AS Duration
      FROM User_habit 
      WHERE USER_ID = ? AND Schedule = 0
      ORDER BY (HOUR(EndTime) * 60 + MINUTE(EndTime) - (HOUR(StartTime) * 60 + MINUTE(StartTime))) * Success DESC 
      LIMIT 3
    `, { replacements: [USER_ID] });

    // 3. 가장 많이 Success한 순서대로 Title 3개를 가져옵니다.
    const [topSuccessTitles] = await sequelize.query(`
      SELECT Title, Success FROM User_habit 
      WHERE USER_ID = ? AND Schedule = 0
      ORDER BY Success DESC 
      LIMIT 3
    `, { replacements: [USER_ID] });

    // 4. User_habit 테이블에서 USER_ID에 연결된 HABIT_ID 개수와 
    // 모든 HABIT_ID 개수 / 모든 USER_ID 개수의 결과값을 가져옵니다.
    const [[userHabitCount]] = await sequelize.query(`
      SELECT COUNT(HABIT_ID) as Count FROM User_habit 
      WHERE USER_ID = ? AND Schedule = 0
    `, { replacements: [USER_ID] });

    const [[avgHabitPerUser]] = await sequelize.query(`
      SELECT (COUNT(HABIT_ID) / COUNT(DISTINCT USER_ID)) as Avg FROM User_habit
    `);

    // 5. 내가 앱 처음으로 시작한 시간
    const [[userAccessDate]] = await sequelize.query(`
      SELECT AccessDate FROM User WHERE USER_ID = ?
    `, { replacements: [USER_ID] });

    // 6. 총 시간
    const [[totalDuration]] = await sequelize.query(`
      SELECT SUM((HOUR(EndTime) * 60 + MINUTE(EndTime) - (HOUR(StartTime) * 60 + MINUTE(StartTime))) * Success) AS TotalDuration 
      FROM User_habit WHERE USER_ID = ? AND Schedule = 0
   `, { replacements: [USER_ID] });

   // 7. 총 성공률
   const [[userSuccessRate]] = await sequelize.query(`
     SELECT MySuccess FROM User WHERE USER_ID = ?
   `, { replacements: [USER_ID] });

   // 8. 내가 습관 성공한 총 횟수
   const [[totalSuccessCount]] = await sequelize.query(`
     SELECT SUM(Success) AS TotalSuccessCount 
     FROM User_habit WHERE USER_ID = ? AND Schedule = 0
   `, { replacements: [USER_ID] });

    res.json({
      topRatedTitles,
      topDurationTitles,
      topSuccessTitles,
      userHabitCount,
      avgHabitPerUser,
      userAccessDate,
      totalDuration,
      userSuccessRate,
      totalSuccessCount
    });
  } catch (err) {
    console.error('Failed to retrieve data:', err);
    res.status(500).send('Internal Server Error');
  }
});


////////////////////////////////////////////////////////////////////////

app.post('/set/tag', async (req, res) => {
  try {
    const tagName = req.body.tagName;
    const targetSuccess = req.body.targetSuccess; // 목표 성공률 값을 받아옵니다.

    if (!tagName) {
      return res.status(400).send('Tag name is required');
    }
    
    if (targetSuccess === undefined || isNaN(targetSuccess)) {
      return res.status(400).send('Valid target success rate is required');
    }

    // 모든 Select 필드를 0으로 초기화
    await sequelize.query(`
      UPDATE Tag SET \`Select\` = 0
    `);
    
    // 입력받은 태그의 Select를 1로 설정하고 Target_Success 값을 업데이트
    await sequelize.query(`
      UPDATE Tag SET \`Select\` = 1, TargetSuccess = :targetSuccess WHERE Name = :tagName
    `, { replacements: { tagName, targetSuccess } });

    res.send('Selected tag and target success rate updated successfully.');
  } catch (err) {
    console.error('Error setting selected tag:', err);
    res.status(500).send('Server error');
  }
});

////////////////////////////////////////////////////////////////////////

app.get('/get/tag', async (req, res) => {
  try {
    const [tags] = await sequelize.query(`
      SELECT Name, USER_COUNT, Success_Per, TargetSuccess FROM Tag WHERE \`Select\` = 1
    `);

    if (tags.length === 0) {
      return res.status(404).send('No selected tag found');
    }

    res.json(tags[0]);
  } catch (err) {
    console.error('Error fetching selected tag:', err);
    res.status(500).send('Server error');
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
  const query = `SELECT HABIT_ID, Title, Schedule, Color, AlarmTime, StartTime, EndTime, Day, TargetDate, TargetSuccess FROM User_habit WHERE USER_ID = ?`;

  sequelize.query(query, { replacements: [USER_ID], type: sequelize.QueryTypes.SELECT })
    .then((results) => {
      res.json(results);
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(504).send('Internal Server Error');
    });
})

/////////////////////////////////////////////////////////////////////////

app.get('/user/level', (req, res) => {   //사용자 레벨 가져오기
  const { USER_ID } = req.query;
  const query = `SELECT Level, CurrentEXP, NextEXP FROM User WHERE USER_ID = ?`;

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

app.get('/follow', (req, res) => {
  const { USER_ID } = req.query;
  const query = `SELECT Target_ID FROM Follow WHERE USER_ID = ?`;

  sequelize.query(query, { replacements: [USER_ID], type: sequelize.QueryTypes.SELECT })
    .then((results) => {
      const targetIDs = results.map(result => result.Target_ID);

      // targetIDs가 비어있다면, 즉시 응답을 보내고 함수를 종료합니다.
      if (targetIDs.length === 0) {
        return res.json([]);
      }

      const userQuery = `SELECT USER_ID, USER_Name FROM User WHERE USER_ID IN (?)`;

      // Sequelize에서 배열을 replacements로 사용할 때, spread 연산자를 사용하여 배열의 요소를 분리합니다.
      sequelize.query(userQuery, { replacements: [targetIDs], type: sequelize.QueryTypes.SELECT })
        .then((userResults) => {
          res.json(userResults);
        })
        .catch((err) => {
          console.error('Failed to execute user query:', err);
          res.status(500).send('Internal Server Error'); // 500은 일반적인 서버 오류 코드입니다. 504는 Gateway Timeout을 의미하므로 여기에서는 적절하지 않습니다.
        });
    })
    .catch((err) => {
      console.error('Failed to execute follow query:', err);
      res.status(500).send('Internal Server Error');
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

app.post('/follower/alarm', async (req, res) => {
  const { USER_ID, HABIT_ID, Follower_ID } = req.body;

  if (!Array.isArray(Follower_ID)) {	//Follower_ID는 배열로 보내줘야함
    return res.status(400).send('Follower_ID should be an array');
  }

  try {
    // Title 가져오기
    const [[{ Title }]] = await sequelize.query(`SELECT Title FROM User_habit WHERE HABIT_ID = ? AND USER_ID = ?`, { replacements: [HABIT_ID, USER_ID] });
    if (!Title) {
      return res.status(404).send('Habit not found');
    }

    // User_Name 가져오기
    const [[{ USER_NAME }]] = await sequelize.query(`SELECT USER_NAME FROM User WHERE USER_ID = ?`, { replacements: [USER_ID] });
    if (!USER_NAME) {
      return res.status(404).send('User not found');
    }

    // Token 여러개 가져오기
    const [users] = await sequelize.query(`SELECT Token FROM User WHERE USER_ID IN (?)`, { replacements: [Follower_ID] });
    
    const tokens = users.map(u => u.Token).filter(Boolean); 
    if (tokens.length === 0) {
      return res.status(404).send('No valid tokens found for users');
    }

    // FCM Message 문자 여러개 보내기
    const message = {
      data: {
        title: '팔로워 알림',
        body: `${USER_NAME} 이 ${Title}을 성공했습니다`
      },
      tokens: tokens
    };

    const response = await admin.messaging().sendMulticast(message);

    // Token dubugging
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      console.error('List of tokens that caused failure: ', failedTokens);
    }

    console.log(response.successCount + ' messages were sent successfully');
    return res.send('Notification sent successfully');
  } catch (err) {
    console.error('Failed to send notification:', err);
    return res.status(500).send('Internal Server Error');
  }
});

/////////////////////////////////////////////////////////////////////////


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


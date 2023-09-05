const express = require('express');
const path = require('path');
const morgan = require('morgan');
const mecab = require('mecab-ya');
const { sequelize } = require('./models');

const app = express();
app.set('port', process.env.PORT || 10000);

app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

////////////////////////////////////////////////////////////////////////

app.post('/user', (req, res) => {   //유저 정보 입력
    const { USER_Name, USER_Email, USER_Password, AccessDate, AccumulateDate, TreeStatus } = req.body;
    const query = `INSERT INTO User (USER_Name, USER_Email, USER_Password, AccessDate, AccumulateDate, TreeStatus) VALUES (?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d'), ?, ?)`;

    sequelize.query(query, { replacements: [USER_Name, USER_Email, USER_Password, AccessDate, AccumulateDate, TreeStatus] })
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

app.post('/user/habit', (req, res) => {   //유저의 습관 정보 입력 스케줄이 0이면 습관 1이면 일과
  const { USER_ID, Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, TargetDate, TargetSuccess } = req.body; // 변경된 부분: USER_Name → USER_ID
  console.log('Received JSON data:', req.body); // JSON 데이터 출력

  mecab.extractNouns(Title, (err, nouns) => {
    if (err) {
      console.error('Error extracting nouns:', err);
      res.status(500).send('Error extracting nouns');
      return;
    }

    // 추출된 명사를 서버에서 보여줄 수 있습니다.
  console.log('Extracted nouns:', nouns);

  const query = `INSERT INTO User_habit (Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, TargetDate, TargetSuccess, USER_ID) VALUES (?, ?, ?, ?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d'), ?, ?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d'), ?, ?)`;

  sequelize.query(query, {
    replacements: [Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, TargetDate, TargetSuccess, USER_ID],
  })
    .then(() => {
      const selectQuery = `SELECT LAST_INSERT_ID() as HABIT_ID`;
      sequelize.query(selectQuery, { plain: true })
        .then((result) => {
          const HABIT_ID = result.HABIT_ID;
          res.json({ HABIT_ID });
        })
        .catch((err) => {
          console.error('Failed to execute query:', err);
          res.status(504).send('Internal Server Error');
        });
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(502).send('User_habit INSERT Error');
    });
});
});

////////////////////////////////////////////////////////////////////////

app.post('/renewal', (req, res) => {      //습관 성공,실패 기록
  const { USER_ID, HABIT_ID, isSuccess } = req.body;

  const updateAccumulateQuery = `UPDATE User_habit SET Accumulate = Accumulate + 1 WHERE USER_ID = ? AND HABIT_ID = ?`;
  sequelize.query(updateAccumulateQuery, { replacements: [USER_ID, HABIT_ID] })
    .then(() => {
      if (isSuccess) {
        const updateSuccessQuery = `UPDATE User_habit SET Success = Success + 1,  Daily = 1 WHERE USER_ID = ? AND HABIT_ID = ?`;
        sequelize.query(updateSuccessQuery, { replacements: [USER_ID, HABIT_ID] })
          .then(() => {
            res.send('Data updated successfully');
          })
          .catch((err) => {
            console.error('Failed to update Success:', err);
            res.status(501).send('Internal Server Error');
          });
      } else {
        const updateFailQuery = `UPDATE User_habit SET Fail = Fail + 1,  Daily = 0 WHERE USER_ID = ? AND HABIT_ID = ?`;
        sequelize.query(updateFailQuery, { replacements: [USER_ID, HABIT_ID] })
          .then(() => {
            res.send('Data updated successfully');
          })
          .catch((err) => {
            console.error('Failed to update Fail:', err);
            res.status(502).send('Internal Server Error');
          });
      }
    })
    .catch((err) => {
      console.error('Failed to update Accumulate:', err);
      res.status(503).send('Internal Server Error');
    });
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
  const query = `SELECT Title FROM User_habit WHERE USER_ID = ? AND Success > TargetSuccess`;

  sequelize.query(query, { replacements: [USER_ID] })
    .then(([results]) => {
      const successHabits = results.map(result => result.Title);
      res.json(successHabits); // 성공한 습관의 Title들을 보내줌
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(500).send('Internal Server Error');
    });
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


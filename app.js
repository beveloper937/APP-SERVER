const express = require('express');
const path = require('path');
const morgan = require('morgan');
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

app.post('/user/habit', (req, res) => {   //유저의 습관 정보 입력
  const { USER_Name, Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, TargetDate, TargetSuccess } = req.body;
  console.log('Received JSON data:', req.body); // JSON 데이터 출력
  const usercheck = `SELECT * FROM User WHERE USER_Name LIKE ?`;

  sequelize.query(usercheck, { replacements: [`%${USER_Name}%`], type: sequelize.QueryTypes.SELECT })
    .then((users) => {
      if (users.length === 0) {
        res.status(400).send('사용자가 존재하지 않습니다.');
      } else {
        const USER_ID = users[0].USER_ID;

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
      }
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(503).send('Internal Server Error');
    });
});


////////////////////////////////////////////////////////////////////////

app.post('/renewal', (req, res) => {
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

app.post('/user/find', (req, res) => {   // 친구 찾기
  const { USER_Name } = req.body;
  const usercheck = `SELECT USER_Name, USER_ID FROM User WHERE USER_Name LIKE ?`;

  sequelize.query(usercheck, { replacements: [`%${USER_Name}%`], type: sequelize.QueryTypes.SELECT })
  .then(users => {
    if (users.length === 0) {
      res.status(404).send('유저를 찾을 수 없습니다.');
    } else {
      res.json(users); // 검색 결과를 JSON 형식으로 클라이언트에게 반환
    }
  })
  .catch(err => {
    console.error('Failed to execute query:', err);
    res.status(500).send('Internal Server Error');
  });
});


////////////////////////////////////////////////////////////////////////

app.get('/info', (req, res) => {   ///info?USER_ID=<사용자 ID> 이렇게 보내줘야됨
  const { USER_ID } = req.query;
  const query = `SELECT HABIT_ID, Title, Color, StartTime, EndTime, Day, TargetDate, TargetSuccess FROM User_habit WHERE USER_ID = ?`;

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

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
  const { USER_Name, Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail } = req.body;
  console.log('Received JSON data:', req.body); // JSON 데이터 출력
  const usercheck = `SELECT * FROM User WHERE USER_Name LIKE ?`;

  sequelize.query(usercheck, { replacements: [`%${USER_Name}%`], type: sequelize.QueryTypes.SELECT })
    .then((users) => {
      if (users.length === 0) {
        res.status(400).send('사용자가 존재하지 않습니다.');
      } else {
        const USER_ID = users[0].USER_ID;

        const query = `INSERT INTO User_habit (Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, USER_ID) VALUES (?, ?, ?, ?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d'), ?, ?, ?, ?, ?)`;
        sequelize.query(query, {
          replacements: [Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Daily, Success, Fail, USER_ID],
        })
          .then(() => {
            res.send('Data added successfully');
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
  const { User_ID, Title, isSuccess } = req.body;

  const findQuery = `SELECT * FROM User_habit WHERE User_ID = ? AND Title = ?`;

  sequelize.query(findQuery, { replacements: [User_ID, Title], type: sequelize.QueryTypes.SELECT })
    .then((habits) => {
      if (habits.length === 0) {
        res.status(404).send('Habit not found');
      } else {
        const habit = habits[0];
        const { Accumulate, Daily, Success, Fail } = habit;

        // Accumulate 값 1 증가
        const updateAccumulateQuery = `UPDATE User_habit SET Accumulate = Accumulate + 1 WHERE User_ID = ? AND Title = ?`;
        sequelize.query(updateAccumulateQuery, { replacements: [User_ID, Title] })
          .then(() => {
            // Daily 값 갱신 (성공: 1, 실패: 0)
            const updateDailyQuery = `UPDATE User_habit SET Daily = ? WHERE User_ID = ? AND Title = ?`;
            sequelize.query(updateDailyQuery, { replacements: [isSuccess ? 1 : 0, User_ID, Title] })
              .then(() => {
                // Success 값 갱신
                if (isSuccess) {
                  const updateSuccessQuery = `UPDATE User_habit SET Success = Success + 1 WHERE User_ID = ? AND Title = ?`;
                  sequelize.query(updateSuccessQuery, { replacements: [User_ID, Title] })
                    .then(() => {
                      // Success와 Fail 값을 JSON 형식으로 반환
                      res.json({ Success: Success + 1, Fail });
                    })
                    .catch((err) => {
                      console.error('Failed to update Success:', err);
                      res.status(501).send('Internal Server Error');
                    });
                }
                // Fail 값 갱신
                else {
                  const updateFailQuery = `UPDATE User_habit SET Fail = Fail + 1 WHERE User_ID = ? AND Title = ?`;
                  sequelize.query(updateFailQuery, { replacements: [User_ID, Title] })
                    .then(() => {
                      // Success와 Fail 값을 JSON 형식으로 반환
                      res.json({ Success, Fail: Fail + 1 });
                    })
                    .catch((err) => {
                      console.error('Failed to update Fail:', err);
                      res.status(502).send('Internal Server Error');
                    });
                }
              })
              .catch((err) => {
                console.error('Failed to update Daily:', err);
                res.status(503).send('Internal Server Error');
              });
          })
          .catch((err) => {
            console.error('Failed to update Accumulate:', err);
            res.status(504).send('Internal Server Error');
          });
      }
    })
    .catch((err) => {
      console.error('Failed to execute query:', err);
      res.status(505).send('Internal Server Error');
    });
});


////////////////////////////////////////////////////////////////////////

app.get('/info', (req, res) => {   ///info?USER_ID=<사용자 ID> 이렇게 보내줘야됨
  const { USER_ID } = req.query;
  const query = `SELECT Title, Color, StartTime, EndTime, Day FROM User_habit WHERE USER_ID = ?`;

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

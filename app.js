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

app.post('/user', (req, res) => {
    const { USER_Name, USER_Email, USER_Password, AccessDate, AccumulateDate, TreeStatus } = req.body;
    const convertAccessDate = new Date(AccessDate);

    const query = `INSERT INTO User (USER_Name, USER_Email, USER_Password, AccessDate, AccumulateDate, TreeStatus) VALUES (?, ?, ?, ?, ?, ?)`;
    sequelize.query(query, { replacements: [USER_Name, USER_Email, USER_Password, convertAccessDate, AccumulateDate, TreeStatus] })
      .then(() => {
        res.send('Data added successfully');
      })
      .catch((err) => {
        console.error('Failed to execute query:', err);
        res.status(501).send('Internal Server Error');
      });
});

app.post('/user/habit', (req, res) => {
    const { USER_Name, Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Success, Fail } = req.body;
    const usercheck = `SELECT * FROM User WHERE USER_Name LIKE ?`
    sequelize.query(usercheck, { replacements: [USER_Name], type: sequelize.QueryTypes.SELECT})
    .then((users) => {
      if(users.length === 0){
        res.status(400).send('사용자가 존재하지 않습니다.');
      } else {
        const USER_ID = users[0].USER_ID;
        const convertDate = new Date(Date);

        const query = `INSERT INTO User_habit ( Title, Schedule, Color, StartTime, EndTime, Day, Date, Accumulate, Success, Fail, USER_ID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        sequelize.query(query, { replacements: [ Title, Schedule, Color, StartTime, EndTime, Day, convertDate, Accumulate, Success, Fail, USER_ID] })
          .then(() => {
            res.send('Data added successfully');
          })          
          .catch((err) => {
            console.error('Failed to execute query:', err);
            res.status(502).send('Internal Server Error');
          });
      }
    })
      .catch((err) => {
        console.error('Failed to execute query:', err);
        res.status(503).send('Internal Server Error');
      });
});

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

sequelize.sync({ force: false })
  .then(() => {
    console.log('데이터베이스 동기화 완료.');
  })
  .catch((err) => {
    console.error('데이터베이스 동기화 실패:', err);
  });

const Sequelize = require('sequelize');
const User = require('./user');
const UserHabit = require('./user_habit');
const UserTag = require('./user_tag');
const HabitTag = require('./habit_tag');
const Tag = require('./tag');
const Follow = require('./follow');
const HabitWeek = require('./habit_week');

const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.json')[env];
const db = {};

const sequelize = new Sequelize(config.database, config.username, config.password, {  
    host: config.host,
    dialect: config.dialect,
    charset: config.charset
});

db.sequelize = sequelize;
db.User = User;
db.UserHabit = UserHabit;
db.UserTag = UserTag;
db.HabitTag = HabitTag;
db.Tag = Tag;
db.Follow = Follow;
db.HabitWeek = HabitWeek;

User.initiate(sequelize);
UserHabit.initiate(sequelize);
UserTag.initiate(sequelize);
HabitTag.initiate(sequelize);
Tag.initiate(sequelize);
Follow.initiate(sequelize);
HabitWeek.initiate(sequelize);

User.associate(db);
UserHabit.associate(db);
UserTag.associate(db);
HabitTag.associate(db);
Tag.associate(db);
Follow.associate(db);
HabitWeek.associate(db);

module.exports = db;

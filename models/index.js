const Sequelize = require('sequelize');
const User = require('./user');
const UserHabit = require('./user_habit');
const UserTag = require('./user_tag');
const HabitTag = require('./habit_tag');
const Tag = require('./tag');
const HabitChart = require('./habit_chart');
const Follow = require('./follow');

const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.json')[env];
const db = {};

const sequelize = new Sequelize(config.database, config.username, config.password, config);

db.sequelize = sequelize;
db.User = User;
db.UserHabit = UserHabit;
db.UserTag = UserTag;
db.HabitTag = HabitTag;
db.Tag = Tag;
db.HabitChart = HabitChart;
db.Follow = Follow;

User.initiate(sequelize);
UserHabit.initiate(sequelize);
UserTag.initiate(sequelize);
HabitTag.initiate(sequelize);
Tag.initiate(sequelize);
HabitChart.initiate(sequelize);
Follow.initiate(sequelize);

User.associate(db);
UserHabit.associate(db);
UserTag.associate(db);
HabitTag.associate(db);
Tag.associate(db);
HabitChart.associate(db);
Follow.associate(db);

module.exports = db;

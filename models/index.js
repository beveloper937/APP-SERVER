const Sequelize = require('sequelize');
const User = require('./user');
const UserHabit = require('./user_habit');

const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.json')[env];
const db = {};

const sequelize = new Sequelize(config.database, config.username, config.password, config);

db.sequelize = sequelize;
db.User = User;
db.UserHabit = UserHabit;

User.initiate(sequelize);
UserHabit.initiate(sequelize);

User.associate(db);
UserHabit.associate(db);

module.exports = db;

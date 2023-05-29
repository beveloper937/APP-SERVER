const Sequelize = require("sequelize");

class UserHabit extends Sequelize.Model {
    static initiate(sequelize){
        UserHabit.init({
            Habit_ID: {
                type: Sequelize.INTEGER,
                allowNull: false,
                primaryKey: true,
                autoIncrement: true
            },
            Title: {
                type: Sequelize.STRING(45),
                allowNull: false
            },
            StartTime: {
                type: Sequelize.STRING,
                allowNull: true,
                validate: {
                    is: /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/ // HH:MM:SS 형식 유효성 검사
                }
            },
            EndTime: {
                type: Sequelize.STRING,
                allowNull: true,
                validate: {
                    is: /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/ 
                }
            },
            Day: {
                type: Sequelize.STRING,
                allowNull: true
            },
            Date: {
                type: Sequelize.DATE,
                allowNull: true
            },
            Accumulate: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true
            },
            Success: {
                type: Sequelize.DataTypes.FLOAT,
                allowNull:true
            },
            Fail: {
                type: Sequelize.DataTypes.FLOAT,
                allowNull: true
            }
        },{
            sequelize,
            timestamps: false,
            underscored: false,
            modelName: "User_habit",
            tableName: "users_habit",
            paranoid: true,
            charset: "utf8",
            collate: 'utf8_general_ci',
        });
    }
    static associate(db){
        db.UserHabit.belongsTo(db.User,{foreignKey:'User_ID', targetKey:"USER_ID"});
    }
};

module.exports = UserHabit;
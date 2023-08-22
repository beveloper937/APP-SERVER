const Sequelize = require("sequelize");
const UserTag = require('./user_tag');
const mecab = require('mecab-ya');

class UserHabit extends Sequelize.Model {
    static initiate(sequelize){
        UserHabit.init({
            HABIT_ID: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                primaryKey: true,
                autoIncrement: true
            },
            Title: {
                type: Sequelize.STRING(45),
                allowNull: false
            },
            Schedule: {
                type: Sequelize.BOOLEAN,
                allowNull: false
            },
            Color: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            StartTime: {
                type: Sequelize.STRING,
                allowNull: true,
                validate: {
                    is: /^([01]\d|2[0-3]):([0-5]\d)$/ // HH:MM 형식 유효성 검사
                }
            },
            EndTime: {
                type: Sequelize.STRING,
                allowNull: true,
                validate: {
                    is: /^([01]\d|2[0-3]):([0-5]\d)$/
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
            Daily: {
                type: Sequelize.BOOLEAN,
                allowNull: true
            },
            Success: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true
            },
            Fail: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true
            },
            TargetDate: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            TargetSuccess: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            }
        },{
            sequelize,
            hooks: {},
            timestamps: false,
            underscored: false,
            modelName: "Userhabit",
            tableName: "User_habit",
            paranoid: true,
            charset: "utf8mb4",
            collate: 'utf8mb4_general_ci',
        });
    }
    static associate(db){
        db.UserHabit.belongsTo(db.User,{foreignKey:'USER_ID', targetKey:"USER_ID"});
    }
};

// 이벤트 리스너 추가
UserHabit.addHook('afterCreate', 'afterCreateHook', async (userHabit, options) => {
    try {
        console.log('afterCreate event triggered for UserHabit:', userHabit.Title);
    } catch (error) {
        console.error('Error during afterCreate event:', error);
    }
});

module.exports = UserHabit;

const Sequelize = require("sequelize");

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

module.exports = UserHabit;
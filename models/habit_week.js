const Sequelize = require("sequelize");

class HabitWeek extends Sequelize.Model {
    static initiate(sequelize){
        HabitWeek.init({
            WEEK_ID: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                primaryKey: true,
                autoIncrement: true
            },
            Mon_S: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            },
            Tue_S: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            },
	    Wed_S: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            },
	    Thu_S: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            }, 
	    Fri_S: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            },  
	    Sat_S: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            },           
	    Sun_S: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            },  
	    Mon_F: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            },  
	    Tue_F: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            }, 
	    Wed_F: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            },   
	    Thu_F: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            },  
	    Fri_F: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            },  
	    Sat_F: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            }, 
	    Sun_F: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
            },
        },{
            sequelize,
            timestamps: false,
            underscored: false,
            modelName: "HabitWeek",
            tableName: "Habit_Week",
            paranoid: true,
            charset: "utf8mb4",
            collate: 'utf8mb4_general_ci',
        });
    }
    static associate(db){
        db.HabitWeek.belongsTo(db.User,{foreignKey:'USER_ID', targetKey:"USER_ID"});
    }
};

module.exports = HabitWeek;

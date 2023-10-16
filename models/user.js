const Sequelize = require("sequelize");

class User extends Sequelize.Model {
    static initiate(sequelize){
        User.init({
            USER_ID: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                primaryKey: true,
                autoIncrement: true
              },
              USER_Name: {
                type: Sequelize.STRING(45),
                allowNull: false,
              },
              USER_Email: {
                type: Sequelize.STRING(45),
                allowNull: false
              },
              USER_Password: {
                type: Sequelize.STRING(45),
                allowNull: false
              },
              AccessDate: {
                type: Sequelize.DATE,
                allowNull: false
              },
              AccumulateDate: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false
              },
	      MySuccess: {
		type: Sequelize.FLOAT,
		defaultValue: 0
	      },
	      MyRunningPerfectDay: {
		type: Sequelize.INTEGER.UNSIGNED,
		defaultValue: 0
	      },
	      MyBestPerfectDay: {
	      	type: Sequelize.INTEGER.UNSIGNED,
		defaultValue: 0
	      },
	      MyPerfectDay: {
		type: Sequelize.INTEGER.UNSIGNED,
		defaultValue: 0
	      },
	      MyRank: {
		type: Sequelize.FLOAT,
		defaultValue: 0
	      },
              Level: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 1
              },
	      CurrentEXP: {
		type: Sequelize.INTEGER.UNSIGNED,
		defaultValue: 0
	      },
	      NextEXP: {
		type: Sequelize.INTEGER.UNSIGNED,
		defaultValue: 100
	      },
	      Token: {
		type: Sequelize.STRING,
		allowNull: false
	      }
        },{
            sequelize,
            timestamps: false,
            underscored: false,
            modelName: "User",
            tableName: "User",
            paranoid: true,
            charset: "utf8mb4",
            collate: 'utf8mb4_general_ci',
        });
    }
    static associate(db){}
};

module.exports = User;

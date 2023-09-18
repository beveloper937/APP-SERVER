const Sequelize = require("sequelize");

class Tag extends Sequelize.Model {
    static initiate(sequelize){
        Tag.init({
            TAG_ID: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                primaryKey: true,
                autoIncrement: true
              },
              Name: {
                type: Sequelize.STRING(45),
                allowNull: false
              },
              USER_Count: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
              },
              Habit_Success: {
                type: Sequelize.FLOAT,
                 defaultValue: 0
	      },
              Habit_Fail: {
                type: Sequelize.FLOAT,
                defaultValue: 0
              },
              Time_Average: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
              },
        },{
            sequelize,
            timestamps: false,
            underscored: false,
            modelName: "Tag",
            tableName: "Tag",
            paranoid: true,
            charset: "utf8mb4",
            collate: 'utf8mb4_general_ci',
        });
    }
    static associate(db){}
};

module.exports = Tag;

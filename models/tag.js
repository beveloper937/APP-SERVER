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
                allowNull: false
              },
              Habit_Success: {
                type: Sequelize.FLOAT,
                allowNull: false
              },
              Habit_Fail: {
                type: Sequelize.FLOAT,
                allowNull: false
              },
              Time_Average: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false
              },
        },{
            sequelize,
            timestamps: false,
            underscored: false,
            modelName: "Tag",
            tableName: "Tag",
            paranoid: true,
            charset: "utf8",
            collate: 'utf8_general_ci',
        });
    }
    static associate(db){}
};

module.exports = Tag;
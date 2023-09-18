const Sequelize = require("sequelize");

class UserTag extends Sequelize.Model {
  static initiate(sequelize) {
    UserTag.init({
      UT_ID: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
      },  
      Tag: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
      },{
        sequelize,
        timestamps: false,
        underscored: false,
        modelName: "UserTag",
        tableName: "User_tag",
        paranoid: true,
        charset: "utf8mb4",
        collate: "utf8mb4_general_ci",
      });
  }

  static associate(db) {
    db.UserTag.belongsTo(db.User,{foreignKey:'USER_ID', targetKey:'USER_ID'});
    db.UserTag.belongsTo(db.UserHabit,{foreignKey:'HABIT_ID', targetKey:'HABIT_ID'});
    }
}

module.exports = UserTag;

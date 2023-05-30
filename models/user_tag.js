const Sequelize = require("sequelize");

class UserTag extends Sequelize.Model {
  static initiate(sequelize) {
    UserTag.init({
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
        charset: "utf8",
        collate: "utf8_general_ci",
      });
  }

  static associate(db) {
    db.UserTag.belongsTo(db.User,{foreignKey:'USER_ID', targetKey:'USER_ID'});
    db.UserTag.belongsTo(db.UserHabit,{foreignKey:'HABIT_ID', targetKey:'HABIT_ID'});
  }
}

module.exports = UserTag;

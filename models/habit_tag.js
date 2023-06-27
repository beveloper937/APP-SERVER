const Sequelize = require("sequelize");

class HabitTag extends Sequelize.Model {
  static initiate(sequelize) {
    HabitTag.init({},{
        sequelize,
        timestamps: false,
        underscored: false,
        modelName: "HabitTag",
        tableName: "Habit_Tag",
        paranoid: true,
        charset: "utf8mb4",
        collate: "utf8mb4_general_ci",
      });
  }

  static associate(db) {
    db.HabitTag.belongsTo(db.User,{foreignKey:'USER_ID', targetKey:'USER_ID'});
    db.HabitTag.belongsTo(db.UserHabit,{foreignKey:'HABIT_ID', targetKey:'HABIT_ID'});
    db.HabitTag.belongsTo(db.Tag,{foreignKey:'TAG_ID', targetKey:'TAG_ID'});
  }
}

module.exports = HabitTag;

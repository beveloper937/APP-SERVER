const Sequelize = require("sequelize");

class Follow extends Sequelize.Model {
  static initiate(sequelize) {
    Follow.init({
        FOLLOW_ID: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
          },
          Target_ID: {
            type: Sequelize.INTEGER(45),
            allowNull: false
          },
          Target_Name: {
            type: Sequelize.STRING(45),
            allowNull: false
          },
          Follow_Date: {
            type: Sequelize.DATE,
            allowNull: false
          }
    },{
        sequelize,
        timestamps: false,
        underscored: false,
        modelName: "Follow",
        tableName: "Follow",
        paranoid: true,
        charset: "utf8mb4",
        collate: "utf8mb4_general_ci",
      });
  }

  static associate(db) {
    db.Follow.belongsTo(db.User,{foreignKey:'USER_ID', targetKey:'USER_ID'});
    db.Follow.belongsTo(db.User,{foreignKey:'USER_Name', targetKey:'USER_Name'});
  }
}

module.exports = Follow;

const Sequelize = require("sequelize");

class HabitChart extends Sequelize.Model {
    static initiate(sequelize){
        HabitChart.init({
            HABIT_CHART_ID: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                primaryKey: true,
                autoIncrement: true
              },
              Success_Per: {
                type: Sequelize.FLOAT,
                allowNull: false
              },
              Fail_Per: {
                type: Sequelize.FLOAT,
                allowNull: false
              },
              Habit_Rank: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false
              }
        },{
            sequelize,
            timestamps: false,
            underscored: false,
            modelName: "HabitChart",
            tableName: "Habit_Chart",
            paranoid: true,
            charset: "utf8mb4",
            collate: 'utf8mb4_general_ci',
        });
    }
    static associate(db){
        db.HabitChart.belongsTo(db.Tag,{foreignKey:'TAG_ID', targetKey:'TAG_ID'});
    }
};

module.exports = HabitChart;
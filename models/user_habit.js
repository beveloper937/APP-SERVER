const Sequelize = require("sequelize");
const User_Tag = require('./user_tag');

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
            Daily: {
                type: Sequelize.BOOLEAN,
                allowNull: true
            },
            Success: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true
            },
            Fail: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true
            },
            TargetDate: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            TargetSuccess: {
                type: Sequelize.INTEGER.UNSIGNED,
                defaultValue: 0
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

  ////////////////////////////////////////////////////////////////////////

// 명사 추출 함수 정의
async function extractNouns(text) {
    const mecab = new mecab(); // MeCab 객체를 생성합니다.
    const result = await mecab.nouns(text); // 명사 추출을 수행합니다.
    return result;
  }
  
  UserHabit.addHook('afterCreate', 'afterCreateHook', async (userHabit, options) => {
    try {
      console.log('afterCreate event triggered for UserHabit:', userHabit.toJSON());
      const extractedNouns = await extractNouns(userHabit.Title);
      await processExtractedNouns(extractedNouns, userHabit.USER_ID, userHabit.HABIT_ID);
    } catch (error) {
      console.error('Error during afterCreate event:', error);
    }
  });
  
  // 추출한 명사를 처리하는 함수 정의
  async function processExtractedNouns(nouns, userID, habitID) {
    try {
      for (const noun of nouns) {
        await saveNounToUserTag(userID, habitID, noun);
      }
    } catch (error) {
      console.error('Error during processing extracted nouns:', error);
    }
  }
  
  // 추출한 명사를 User_Tag 테이블에 저장하는 함수 정의
  async function saveNounToUserTag(userID, habitID, noun) {
    try {
      const userTag = await User_Tag.create({
        USER_ID: userID,
        HABIT_ID: habitID,
        Tag: noun,
      });
      console.log(`Saved noun "${noun}" to User_Tag:`, userTag.toJSON());
    } catch (error) {
      console.error('Error while saving noun to User_Tag:', error);
    }
  }
  
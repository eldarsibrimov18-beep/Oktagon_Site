// модель для пользовательских маршрутов

const { DataTypes } = require("sequelize")
module.exports = function (sequelize) {
    return sequelize.define("custom_routse", {
        Route_custom_ID: {
            primaryKey: true,
            autoIncrement: true, // Исправлено на autoIncrement
            type: DataTypes.INTEGER
        },
        Tourist_ID: {
            type: DataTypes.INTEGER,
        },
        Route_Name: {
            type: DataTypes.STRING
        },
        Route_Description: {
            type: DataTypes.STRING
        },
        Route_Length: {
            type: DataTypes.INTEGER
        },
        Route_Type: {
            type: DataTypes.STRING
        },
        Route_Duration: {
            type: DataTypes.STRING
        },
        Terrain_Type: {
            type: DataTypes.STRING
        },
        WaiPoint1: {
            type: DataTypes.STRING
        }, WaiPoint2: {
            type: DataTypes.STRING
        }, WaiPoint3: {
            type: DataTypes.STRING
        }, WaiPoint4: {
            type: DataTypes.STRING
        }, WaiPoint5: {
            type: DataTypes.STRING
        }, WaiPoint6: {
            type: DataTypes.STRING
        }, WaiPoint7: {
            type: DataTypes.STRING
        }, WaiPoint8: {
            type: DataTypes.STRING
        }, WaiPoint9: {
            type: DataTypes.STRING
        }, WaiPoint10: {
            type: DataTypes.STRING
        }, WaiPoint11: {
            type: DataTypes.STRING
        }, WaiPoint12: {
            type: DataTypes.STRING
        }, WaiPoint13: {
            type: DataTypes.STRING
        }, WaiPoint14: {
            type: DataTypes.STRING
        }, WaiPoint15: {
            type: DataTypes.STRING
        }, WaiPoint16: {
            type: DataTypes.STRING
        }, WaiPoint17: {
            type: DataTypes.STRING
        }, WaiPoint18: {
            type: DataTypes.STRING
        }, WaiPoint19: {
            type: DataTypes.STRING
        }, WaiPoint20: {
            type: DataTypes.STRING
        },
    }, {
        timestamps: false,
        tableName: 'custom_routse'
    })
}
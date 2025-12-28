// ДА ПОМОЖЕТ НАМ БОГ 
require("dotenv").config({ quiet: true })


const sequelize = require("sequelize")
const bodyParser = require("body-parser")
const express = require("express")
const app = express()
const path = require("path")
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const axios = require('axios');


const db = require("./db/indexdb")
const Turist = db.Turist
const Guide = db.Guide
const Route = db.Route
const Record = db.Record
const Custum_Route = db.Custum_Route
const Route_Schedule = db.Route_Schedule
const Route_Point = db.Route_Point



const __dirnames = __dirname.replace("script", "")
const SECRET_KEY = process.env.JWT_SECRET


app.use(express.json());
app.use(express.static(path.join(__dirnames, 'css')));
app.use(cookieParser());


const Working_Site = () => {
    app.get("", (req, res) => {
        res.sendFile(__dirnames + "index.html")
    })

    app.get("/autorization", (req, res) => {
        res.sendFile(__dirnames + "autorization.html")
    })
    app.get("/scheduler", (req, res) => {
        res.sendFile(__dirnames + "scheduler.html")
    })
    app.get("/lk", (req, res) => {
        res.sendFile(__dirnames + "lk.html")
    })
    app.get("/registration", (req, res) => {
        res.sendFile(__dirnames + "registration.html")
    })
    app.get("/trek", (req, res) => {
        res.sendFile(__dirnames + "trek.html")
    })

    // Добавьте этот блок кода в index.js, например, перед startServer()

    app.get("/api/get-route-details", async (req, res) => {
        const { id, type } = req.query;

        if (!id || !type) {
            return res.status(400).json({ error: "Не указан ID или тип маршрута" });
        }

        try {
            let routeData = {
                name: "",
                points: [], // массив объектов {lat, lng, name}
                schedule: [] // Добавляем расписание (опционально)
            };

            if (type === 'standard') {
                // 1. Логика для Готовых маршрутов (Используем Route_Point)
                const route = await Route.findByPk(id, {
                    include: [{
                        model: Route_Point,
                        as: 'points'
                    }],
                    order: [[{ model: Route_Point, as: 'points' }, 'Sequence_Number', 'ASC']] // Изменено на 'Sequence_Number'
                });

                if (!route) return res.status(404).json({ error: "Маршрут не найден" });

                routeData.name = route.Route_Name;

                if (route.points && route.points.length > 0) {
                    routeData.points = route.points.map(pt => {
                        // Координаты из pt.Coordinates
                        const [lat, lng] = pt.Coordinates ? pt.Coordinates.split(',').map(s => parseFloat(s.trim())) : [0, 0];
                        return { lat, lng, name: pt.Point_Name };
                    });
                }
            } else if (type === 'custom') {
                // 2. Логика для Пользовательских маршрутов (Custom_Route)
                const route = await Custum_Route.findByPk(id, {
                    include: [{
                        model: Route_Schedule,
                        as: 'Route_Schedules' // Предполагаем, что связь настроена как hasMany
                    }]
                });

                if (!route) return res.status(404).json({ error: "Маршрут не найден" });

                routeData.name = route.Route_Name;

                // Собираем WaiPoint1...20
                for (let i = 1; i <= 20; i++) {
                    const wpRaw = route[`WaiPoint${i}`];
                    if (wpRaw) {
                        const [lat, lng] = wpRaw.split(',').map(s => parseFloat(s.trim()));
                        routeData.points.push({ lat, lng, name: `Точка ${i}` });
                    }
                }

                // Добавляем расписание (если есть)
                if (route.Route_Schedules && route.Route_Schedules.length > 0) {
                    routeData.schedule = route.Route_Schedules.map(sch => ({
                        point_index: sch.Point_Index,
                        visit_date: sch.Visit_Date,
                        visit_time: sch.Visit_Time,
                        note: sch.Note
                    }));
                }
            }

            res.json(routeData);

        } catch (err) {
            console.error("Ошибка при получении деталей маршрута:", err);
            res.status(500).json({ error: "Ошибка сервера" });
        }
    });


    app.get('/api/user-routes', async (req, res) => {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ error: 'Не авторизован' });

        let touristId;
        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            touristId = decoded.id; // Tourist_ID из токена
        } catch (err) {
            return res.status(401).json({ error: 'Неверный токен' });
        }

        try {
            const routes = []; // Здесь используем 'routes' вместо 'routeData'

            // Готовые маршруты (standard)
            const records = await Record.findAll({ where: { Tourist_ID: touristId } });
            for (const record of records) {
                if (record.Route_ID === 0) continue; // Игнорируем неверные записи с Route_ID = 0
                const route = await Route.findByPk(record.Route_ID);
                if (route) {
                    routes.push({
                        bookingId: `standard_${record.Route_ID}`, // Используем Route_ID для bookingId
                        title: route.Route_Name || 'Неизвестный маршрут',
                        date: record.Trip_Start_Date ? record.Trip_Start_Date.toISOString().split('T')[0] : null
                    });
                }
            }

            // Пользовательские маршруты (custom)
            const customs = await Custum_Route.findAll({ where: { Tourist_ID: touristId } });
            for (const custom of customs) {
                routes.push({
                    bookingId: `custom_${custom.Route_custom_ID}`,
                    title: custom.Route_Name || 'Пользовательский маршрут',
                    date: null // Можно добавить из Route_Schedule, если нужно
                });
            }

            res.json(routes);
        } catch (err) {
            console.error('Ошибка в /api/user-routes:', err);
            res.status(500).json({ error: 'Ошибка сервера' });
        }
    });
}

// АВТОРИЗАЦИЯ


app.post("/registration", (req, res) => {
    let Finel_hash_Password = null;
    async function addUsers() {
        async function hashPassword(password) {
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            return hashedPassword;
        }
        Finel_hash_Password = (await hashPassword(req.body["password"])).toString();

        try {
            const existingUser = await Turist.findOne({
                where: { email: req.body["email"] }
            }) || await Guide.findOne({
                where: { email: req.body["email"] }
            });

            if (existingUser) {
                return res.status(400).json({
                    status: "error",
                    message: "Пользователь с такой почтой уже существует"
                });
            }

            let userId, userRole;
            if (req.body["role"] === "participant") {
                const Tourist = await Turist.create({
                    password: Finel_hash_Password,
                    First_Name: req.body["firstName"],
                    Last_Name: req.body["lastName"],
                    email: req.body["email"],
                    role: req.body["role"],
                    experience: req.body["experience"],
                });
                console.log("Новый турист был добавлен в таблицу");
                userId = Tourist.Tourist_ID;
                userRole = "participant";
                const fullName = `${Tourist.First_Name} ${Tourist.Last_Name}`;  // Добавляем
                const initial = Tourist.First_Name[0].toUpperCase();  // Добавляем


                const token = jwt.sign({
                    id: userId,
                    role: userRole,
                    name: fullName,  // Добавляем в payload
                    initial: initial  // Добавляем в payload
                }, SECRET_KEY, { expiresIn: '3d' });

                res.cookie('token', token, {
                    httpOnly: true,
                    maxAge: 3 * 24 * 60 * 60 * 1000,
                    sameSite: 'strict'
                });
            } else if (req.body["role"] === "organizer") {
                const Gide = await Guide.create({
                    password: Finel_hash_Password,
                    First_Name: req.body["firstName"],
                    Last_Name: req.body["lastName"],
                    email: req.body["email"],
                    // Добавьте role/experience, если поля есть в модели Guide.js
                });
                console.log("Новый гид был добавлен в таблицу");
                userId = Gide.Guide_ID;
                userRole = "organizer";

                const fullName = `${Gide.First_Name} ${Gide.Last_Name}`;
                const initial = Gide.First_Name[0].toUpperCase();
                const token = jwt.sign({
                    id: Gide.Guide_ID,
                    role: "organizer",
                    name: fullName,
                    initial: initial
                }, SECRET_KEY, { expiresIn: '3d' });

                res.cookie('token', token, {
                    httpOnly: true,
                    maxAge: 3 * 24 * 60 * 60 * 1000,
                    sameSite: 'strict'
                });
            } else {
                return res.status(400).json({ status: "error", message: "Неверная роль" });
            }

            // Отправляем ответ ПОСЛЕ куки
            res.status(200).json({ status: "ok", role: userRole });

        } catch (err) {
            console.log("Произошла ошибка");
            console.log(err);
            res.status(500).json({ status: "err" });
        }
    }
    addUsers();
});

app.post("/autorization", async (req, res) => {
    try {
        const { email, password } = req.body;

        let user = await Turist.findOne({ where: { email: email } });
        let userRole = "participant";

        if (!user) {
            user = await Guide.findOne({ where: { email: email } });
            userRole = "organizer";
        }

        if (!user) {
            return res.status(400).json({
                status: "error",
                message: "Пользователь с такой почтой не найден"
            });
        }


        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(400).json({
                status: "error",
                message: "Неверный пароль"
            });
        }

        const fullName = `${user.First_Name} ${user.Last_Name}`;
        const initial = user.First_Name[0].toUpperCase();

        const token = jwt.sign({
            id: userRole === "participant" ? user.Tourist_ID : user.Guide_ID,
            role: userRole,
            name: fullName,
            initial: initial
        }, SECRET_KEY, { expiresIn: '3d' });

        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 3 * 24 * 60 * 60 * 1000,
            sameSite: 'strict'
        });

        res.status(200).json({ status: "ok", role: userRole });

    } catch (err) {
        console.error("Ошибка авторизации:", err);
        res.status(500).json({ status: "error", message: "Внутренняя ошибка сервера" });
    }
});

// ВЫХОД ИЗ АККАУНТА
app.post("/logout", (req, res) => {
    res.clearCookie('token');
    res.status(200).json({ status: "ok" });
});

function readyRouts() {
    app.get("/routes", async (req, res) => {
        try {
            const routes = await Route.findAll();
            const result = routes.map(route => ({
                Route_ID: route.Route_ID,  // Используйте оригинальные имена для Vue
                Route_Name: route.Route_Name,
                Route_Description: route.Route_Description,
                Route_Length: route.Route_Length,
                Route_Duration: route.Route_Duration,
                Stop: route.Stop  // Добавьте недостающее поле
                // Добавьте другие поля из модели, если нужно: Route_Type, Terrain_Type и т.д.
            }));
            res.json({ routes: result });  // Оберните в { routes: [...] }
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Ошибка получения маршрутов" });
        }
    });
    // 2 Запись на маршрут
    app.post("/api/join-route", async (req, res) => {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ error: "Не авторизован" });

        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            if (decoded.role !== "participant") {
                return res.status(403).json({ error: "Доступно только для участников" });
            }

            const { routeId, date } = req.body;

            await Record.create({
                Tourist_ID: decoded.id,
                Route_ID: routeId,
                Trip_Start_Date: date
            });

            res.json({ status: "ok" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Ошибка записи" });
        }
    });

    // 3 Получение маршрутов пользователя для ЛК
    app.get('/api/user-routes', async (req, res) => {
        const token = req.cookies.token;
        if (!token) return res.status(401).json([]); // Или редирект

        let userId;
        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            userId = decoded.id; // Предполагаем, что Tourist_ID в token
        } catch (err) {
            return res.status(401).json([]);
        }

        try {
            const data = [];

            // Standard маршруты (из Record)
            const records = await Record.findAll({ where: { Tourist_ID: userId } });
            for (const record of records) {
                const route = await Route.findByPk(record.Route_ID);
                if (route) { // Проверяем существование
                    data.push({
                        bookingId: `standard_${record.Route_ID}`, // Исправьте на record.Route_ID (если было Trip_ID)
                        title: route.Route_Name || 'Неизвестно',
                        date: record.Trip_Start_Date,// Или format
                        days: routeData.Route_Duration,
                        distance: routeData.Route_Length, // Здесь обычно "10 км" (строка) или число
                        description: routeData.Route_Description,
                        type: 'standard'
                    });
                }
            }

            // Custom маршруты
            const customs = await Custum_Route.findAll({ where: { Tourist_ID: userId } });
            for (const custom of customs) {
                data.push({
                    bookingId: `custom_${custom.Route_custom_ID}`,
                    title: custom.Route_Name || 'Пользовательский маршрут',
                    date: null,
                    days: cRoute.Route_Duration || "Свой график",
                    distance: distKm,
                    description: cRoute.Route_Description,
                    type: 'custom' // Флаг, чтобы отличать в верстке (можно добавить кнопку "Редактировать")
                });
            }

            res.json(data);
        } catch (err) {
            console.error('Ошибка в /api/user-routes:', err);
            res.status(500).json([]);
        }
    });








    // 4 Проверка статуса авторизации
    app.get("/api/auth-status", async (req, res) => {
        const token = req.cookies.token;
        if (!token) {
            return res.json({ isAuthenticated: false });
        }

        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            return res.json({
                isAuthenticated: true,
                user: {
                    name: decoded.name,
                    role: decoded.role,  // В ЛК Vue.js переводит в 'Путешественник' или 'Гид'
                    initial: decoded.initial
                }
            });
        } catch (error) {
            console.error("Ошибка верификации токена:", error);
            return res.json({ isAuthenticated: false });
        }
    });
    // ==========================================
    // 5. Сохранение пользовательского маршрута с расписанием
    // ==========================================
    app.post("/api/save-custom-route", async (req, res) => {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ error: "Не авторизован" });

        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            const userId = decoded.id; // ID текущего пользователя

            const { name, description, length, duration, points, schedule } = req.body;

            // 1. Создаем сам маршрут
            const newRouteData = {
                Tourist_ID: userId, // Привязываем к пользователю
                Route_Name: name || "Без названия",
                Route_Description: description || "",
                Route_Length: parseInt(length) || 0,
                Route_Duration: duration || "",
                Route_Type: "Custom",
                Terrain_Type: "Mixed"
            };

            // Заполняем WaiPoint1...20
            if (Array.isArray(points)) {
                for (let i = 0; i < 20; i++) {
                    const key = `WaiPoint${i + 1}`;
                    newRouteData[key] = points[i] ? `${points[i].lat}, ${points[i].lng}` : null;
                }
            }

            const createdRoute = await Custum_Route.create(newRouteData);

            // 2. Сохраняем расписание (если оно есть)
            if (schedule && Array.isArray(schedule) && schedule.length > 0) {
                const scheduleRecords = schedule.map(item => ({
                    Route_custom_ID: createdRoute.Route_custom_ID,
                    Point_Index: item.point_index,
                    Visit_Date: item.visit_date,
                    Visit_Time: item.visit_time,
                    Note: "Запланировано"
                }));

                await Route_Schedule.bulkCreate(scheduleRecords);
            }

            res.status(200).json({ status: "ok", message: "Маршрут и расписание сохранены" });

        } catch (err) {
            console.error("Ошибка при сохранении маршрута:", err);
            res.status(500).json({ error: "Ошибка сохранения маршрута" });
        }
    });


}
// ПРОКЛАДКА МАРШРУТОВ (ВЕЛОСИПЕД)
// ПРОКЛАДКА МАРШРУТОВ (ВЕЛОСИПЕД)
app.post('/generate-route', async (req, res) => {
    const { coordinates } = req.body;

    // Валидация входных данных
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
        return res.status(400).json({ error: 'Для маршрута нужно минимум 2 точки.' });
    }

    try {
        const apiKey = process.env.ORS_API_KEY; // Убедись, что ключ есть в .env

        // Формируем радиусы поиска дорог (ставим 2000м, но на бесплатном тарифе лимит ~350м)
        const radiuses = coordinates.map(() => 2000);

        // Используем профиль 'cycling-mountain' для лучшей проходимости в лесах
        const response = await axios.post('https://api.openrouteservice.org/v2/directions/foot-hiking/geojson', {
            coordinates: coordinates,
            elevation: true,
            extra_info: ['waytype', 'surface', 'steepness'],
            radiuses: radiuses
        }, {
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            }
        });

        // Если маршрут пустой или API вернул странный ответ
        if (!response.data.features || response.data.features.length === 0) {
            return res.status(422).json({ error: 'Маршрут не найден. Нет дорог рядом.' });
        }

        const route = response.data.features[0];
        const summary = route.properties.summary;

        // БЕЗОПАСНАЯ СБОРКА ОТВЕТА (защита от крашей toFixed)
        res.json({
            distance: ((summary.distance || 0) / 1000).toFixed(2) + ' км',
            duration: ((summary.duration || 0) / 3600).toFixed(2) + ' ч', // Время для велика
            ascent: (summary.ascent || 0).toFixed(0) + ' м',
            descent: (summary.descent || 0).toFixed(0) + ' м',
            geometry: route.geometry,
            // Безопасное извлечение сегментов
            segments: route.properties.segments ? route.properties.segments.map((seg, index) => ({
                startToEnd: `Участок ${index + 1}`,
                waytype: seg.extras?.waytype?.summary || 'Неизвестно',
                surface: seg.extras?.surface?.summary || 'Грунт/Тропа',
                distance: ((seg.distance || 0) / 1000).toFixed(2) + ' км'
            })) : []
        });

    } catch (error) {
        // Логирование для отладки
        if (error.response && error.response.data) {
            console.error("Ошибка ORS:", JSON.stringify(error.response.data, null, 2));

            // Обработка ошибки "Точка слишком далеко от дороги" (Code 2010)
            if (error.response.data.error?.code === 2010) {
                return res.status(422).json({
                    error: 'Точка слишком далеко от дороги/тропы. Передвиньте метку ближе к путям.'
                });
            }
        } else {
            console.error("Ошибка сервера:", error.message);
        }

        res.status(500).json({ error: 'Не удалось построить веломаршрут.' });
    }
});

function startServer() {
    Working_Site()
    readyRouts()

    const server = app.listen(process.env.PORT, () => {
        console.log(`Сервер запущен на порту ${process.env.PORT}`);
    });

    server.on('error', (err) => {
        console.error("Ошибка при запуске сервера:", err.message);
        console.log("Повторная попытка через 3 секунды...");
        setTimeout(startServer, 3000); // Рекурсивный вызов
    });
}

startServer();
const express = require("express");
const app = express();
app.use(express.json());
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDbAndServer = async () => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });
        app.listen(3000, () => {
            console.log("Server is running...");
        });
    } catch (e) {
        console.log(`DB Error: ${e.message}`);
        process.exit(1);
    }
};
initializeDbAndServer();
//App1
app.post("/register/", async (request, response) => {
    const { name, username, password, gender } = request.body;
    const SelectUserQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
    const dbUser = await db.get(SelectUserQuery);
    if (dbUser !== undefined) {
        response.status(400);
        response.send("User already exists");
    } else {
        if (`${password}`.length < 6) {
            response.status(400);
            response.send("Password is too short");
        } else {
            const hashedPassword = await bcrypt.hash(`${password}`, 10);
            const query = `
            INSERT INTO user(name,username,password,gender)
            VALUES ('${name}','${username}','${hashedPassword}','${gender}');
        `;
            await db.run(query);
            response.send("User created successfully");
        }
    }
});
//App2
app.post("/login/", async (request, response) => {
    const { username, password } = request.body;
    const SelectUserQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
    const dbUser = await db.get(SelectUserQuery);
    if (dbUser === undefined) {
        response.status(400);
        response.send("Invalid user");
    } else {
        const isCorrectPassword = await bcrypt.compare(
            `${password}`,
            dbUser.password
        );
        if (!isCorrectPassword) {
            response.status(400);
            response.send("Invalid password");
        } else {
            const payload = { username: username };
            const jwtToken = jwt.sign(payload, "SECRET_KEY");
            response.status(200);
            response.send({ jwtToken });
        }
    }
});
const authenticateToken = (request, response, next) => {
    const authHeader = request.headers["authorization"];
    let jwtToken = null;
    if (authHeader !== undefined) {
        jwtToken = authHeader.split(" ")[1];
        jwt.verify(jwtToken, "SECRET_KEY", (error, user) => {
            if (error) {
                response.status(401);
                response.send("Invalid JWT Token");
            } else {
                request.username = user.username;
                next();
            }
        });
    } else {
        response.status(401);
        response.send("Invalid JWT Token");
    }
};
const convertCase = (obj) => {
    return { username: obj.username, tweet: obj.tweet, dateTime: obj.dateTime };
};
//App3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
    const username = request.username;
    const selectUserQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);

    const query = `
        SELECT user.username AS username, tweet.tweet AS tweet, tweet.date_time AS dateTime
        FROM follower INNER JOIN tweet ON follower.following_user_id= tweet.user_id INNER JOIN user ON follower.following_user_id= user.user_id
        WHERE follower.follower_user_id= ${dbUser.user_id}
        ORDER BY tweet.date_time DESC
        LIMIT 4;
    `;
    const dbResponse = await db.all(query);
    const responseObj = dbResponse.map((eachObject) => convertCase(eachObject));
    response.send(responseObj);
});
//App4
app.get("/user/following/", authenticateToken, async (request, response) => {
    const username = request.username;
    const SelectUserQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
    const dbUser = await db.get(SelectUserQuery);

    const query = `
        SELECT user.name AS name
        FROM follower INNER JOIN user ON follower.following_user_id= user.user_id
        WHERE follower.follower_user_id= ${dbUser.user_id};
    `;
    const dbResponse = await db.all(query);
    response.send(dbResponse);
});
//App5
app.get("/user/followers/", authenticateToken, async (request, response) => {
    const username = request.username;
    const SelectUserQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
    const dbUser = await db.get(SelectUserQuery);

    const query = `
        SELECT DISTINCT user.name AS name
        FROM follower INNER JOIN user ON follower.follower_user_id= user.user_id
        WHERE follower.following_user_id= ${dbUser.user_id};
    `;
    const dbResponse = await db.all(query);
    response.send(dbResponse);
});
//App6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
    const username = request.username;
    const { tweetId } = request.params;
    const SelectUserQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
    const dbUser = await db.get(SelectUserQuery);
    const query = `
        SELECT B.tweet as tweet, COUNT(DISTINCT B.like_id) as likes, COUNT(DISTINCT B.reply_id) as replies, tweet.date_time AS dateTime
        FROM ((tweet INNER JOIN like ON tweet.tweet_id= like.tweet_id)AS T INNER JOIN reply ON like.tweet_id= reply.tweet_id)AS B INNER JOIN follower ON follower.following_user_id= tweet.user_id
        WHERE follower.follower_user_id= ${dbUser.user_id} and tweet.tweet_id= ${tweetId};
    `;
    const dbResponse = await db.get(query);
    if (dbResponse.tweet === null) {
        response.status(401);
        response.send("Invalid Request");
    } else {
        response.send(dbResponse);
    }
});
//App7
app.get(
    "/tweets/:tweetId/likes/",
    authenticateToken,
    async (request, response) => {
        const username = request.username;
        const { tweetId } = request.params;
        const SelectUserQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
        const dbUser = await db.get(SelectUserQuery);

        const userQuery = `
        SELECT DISTINCT follower.following_user_id AS id
        FROM follower INNER JOIN tweet ON follower.following_user_id= tweet.user_id
        WHERE follower.follower_user_id= ${dbUser.user_id} AND tweet.tweet_id= ${tweetId};
    `;
        const dbCheck = await db.all(userQuery);
        const query = `
           SELECT user.username AS name
           FROM like INNER JOIN user ON like.user_id= user.user_id
           WHERE like.tweet_id= ${tweetId};
        `;
        const dbResponse = await db.all(query);
        if (dbCheck[0] === undefined) {
            response.status(401);
            response.send("Invalid Request");
        } else {
            let Array_1 = [];
            for (let i of dbResponse) {
                Array_1.push(i["name"]);
            }
            response.send({ likes: Array_1 });
        }
    }
);
//App8
app.get(
    "/tweets/:tweetId/replies/",
    authenticateToken,
    async (request, response) => {
        const username = request.username;
        const { tweetId } = request.params;
        const SelectUserQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
        const dbUser = await db.get(SelectUserQuery);

        const userQuery = `
        SELECT DISTINCT follower.following_user_id AS id
        FROM follower INNER JOIN tweet ON follower.following_user_id= tweet.user_id
        WHERE follower.follower_user_id= ${dbUser.user_id} AND tweet.tweet_id= ${tweetId};
    `;
        const dbCheck = await db.all(userQuery);
        const query = `
           SELECT user.name AS name, reply.reply AS reply
           FROM reply INNER JOIN user ON reply.user_id= user.user_id
           WHERE reply.tweet_id= ${tweetId};
        `;
        const dbResponse = await db.all(query);
        if (dbCheck[0] === undefined) {
            response.status(401);
            response.send("Invalid Request");
        } else {
            let Array_1 = [];
            for (let i of dbResponse) {
                Array_1.push(i);
            }
            response.send({ replies: Array_1 });
        }
    }
);
//App9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
    const username = request.username;
    const { tweetId } = request.params;
    const SelectUserQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
    const dbUser = await db.get(SelectUserQuery);

    const query = `
        SELECT tweet.tweet as tweet, COUNT(DISTINCT like.like_id) AS likes, COUNT(DISTINCT reply.reply_id) AS replies, tweet.date_time AS dateTime
        FROM tweet LEFT JOIN like ON tweet.tweet_id= like.tweet_id LEFT JOIN reply ON tweet.tweet_id= reply.tweet_id
        WHERE tweet.user_id= ${dbUser.user_id}
        GROUP BY tweet.tweet_id;
  `;
    const dbResponse = await db.all(query);
    if (dbResponse[0].tweet === null) {
        response.status(401);
        response.send("Invalid Request");
    } else {
        response.send(dbResponse);
    }
});
//App10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
    const username = request.username;
    const { tweet } = request.body;
    const SelectUserQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
    const dbUser = await db.get(SelectUserQuery);
    const today = new Date();
    const time = today.getTime();
    const query = `
    INSERT INTO tweet(tweet,user_id,date_time)
    VALUES ('${tweet}',${dbUser.user_id}, datetime(1092941466, 'unixepoch', 'localtime'));
    `;
    await db.run(query);
    response.send("Created a Tweet");
});
//App11
app.delete(
    "/tweets/:tweetId/",
    authenticateToken,
    async (request, response) => {
        const username = request.username;
        const { tweetId } = request.params;
        const SelectUserQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
        const dbUser = await db.get(SelectUserQuery);
        const tweetQuery = `
    SELECT tweet.tweet AS tweet
    FROM tweet INNER JOIN user ON tweet.user_id= user.user_id
    WHERE tweet.tweet_id= ${tweetId} AND tweet.user_id= ${dbUser.user_id};
  `;
        const tweetResponse = await db.all(tweetQuery);
        if (tweetResponse[0] === undefined) {
            response.status(401);
            response.send("Invalid Request");
        } else {
            const query = `
        DELETE FROM tweet
        WHERE tweet_id= ${tweetId};
    `;
            await db.run(query);
            response.send("Tweet Removed");
        }
    }
);
module.exports = app;

import express from "express";
import bodyParser from "body-parser";
import webhookRouter from "./routes/webhook";
import loyaltyRouter from "./routes/loyalty";

const app = express();

app.use(bodyParser.json());

app.use('/', webhookRouter);
app.use('/', loyaltyRouter);

export default app
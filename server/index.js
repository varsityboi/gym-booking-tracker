import app from "./app.js";

// PORT from the environment (server/.env), otherwise 3000.
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`PORT must be a whole number from 1 to 65535, got "${process.env.PORT}"`);
  process.exit(1);
}

// Express 5 calls this once: with an error if the server couldn't start
// listening (e.g. the port is taken), otherwise with nothing once it is.
app.listen(PORT, (err) => {
  if (err) {
    console.error(
      err.code === "EADDRINUSE"
        ? `port ${PORT} is already in use, stop the other server first`
        : `couldn't start the server on port ${PORT}: ${err.message}`
    );
    process.exit(1);
  }
  console.log(`Server running on http://localhost:${PORT}`);
});

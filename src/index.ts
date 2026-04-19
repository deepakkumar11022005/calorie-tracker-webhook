import 'dotenv/config'; // Instantly loads env vars before any further module resolution
import app from './app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

import { app } from './app.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[server] Migration Estimator API running on http://localhost:${PORT}`);
});

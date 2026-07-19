require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const app = require('../api/index');

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

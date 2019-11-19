import app from "./app";

const PORT = process.env.PORT || 5000;
app.listen(PORT, function() {
  console.log("Express server running at http://localhost:" + PORT);
});

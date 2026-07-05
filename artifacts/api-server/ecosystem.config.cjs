module.exports = {
  apps: [
    {
      name: "bet62-api",
      script: "dist/index.mjs",
      env: {
        NODE_ENV: "production",
        REDIS_URL: "redis://127.0.0.1:6379",
        PORT: 3000
      }
    }
  ]
};

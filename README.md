# Xero NodeJS OAuth 2.0 App
This NodeJS project demonstrates how to use the xero-node SDK. 

Note: this project was built using Visual Studio Code and NodeJS

## How to use

### Configure with your credentials
Create an OAuth 2.0 app in Xero to get a *CLIENT_ID* and *CLIENT_SECRET*.

* Create a free Xero user account (if you don't have one) 
* Login to Xero Developer center https://developer.xero.com/myapps
* Click "Try OAuth 2.0"
* Enter your app details (your redirect URI: `http://localhost:${PORT}`)
* Click "Create App"
* Click "Generate a secret"
* Create a `.env` in the root of your project, and replace the 3 variables
```
CLIENT_ID=...
CLIENT_SECRET=...
REDIRECT_URI=...
```

<!-- "create app" screenshot -->
<!-- "generate secret" screenshot -->

### Build and run

```sh
npm install
npm run start-dev
```

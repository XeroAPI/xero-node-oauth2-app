# Xero NodeJS OAuth 2.0 App
This NodeJS project demonstrates how to use the xero-node SDK. 

Note: this project was built using Visual Studio Code and NodeJS v10.

## How to use

### Configure with your credentials
Create an OAuth 2.0 app in Xero to get a _XERO_CLIENT_ID_ and _XERO_CLIENT_SECRET_.

* Create a free Xero user account (if you don't have one) 
* Login to Xero Developer center https://developer.xero.com/myapps
* Click "Try OAuth 2.0"
* Enter your app details (your redirect URI is http://localhost:5000)
* Click "Create App"
* Copy your client id and redirect URI into `lib/app.ts`
```js
const client_id = '_YOUR_CLIENT_ID';
const redirectUrl = 'http://localhost:5000/callback';
```
<!-- "create app" screenshot -->

* Click "Generate a secret"
* Copy your secret into `lib/app.ts`
```js
const client_secret = '_YOUR_CLIENT_SECRET'
```

<!-- "generate secret" screenshot -->

### Build and run

```sh
npm install
npm run prod
```
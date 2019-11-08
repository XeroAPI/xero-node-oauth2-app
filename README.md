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
npm dev
```


# TODO

modemon ?
watch & rebuild tscon .ts changes
# Xero NodeJS OAuth 2.0 App
This Node project demonstrates how to use the https://github.com/XeroAPI/xero-node SDK.

Its purpose is to help javascript developers looking to build amazing applications with the data of users of the Xero Accounting platform: https://xero.com/. Secure authentication is setup using industry standard OAuth2.0. Access tokens fuel authorized api calls.

## Setup
```
git clone git@github.com:XeroAPI/xero-node-oauth2-app.git
cd xero-node-oauth2-app
```

### Configure with your credentials
Create an API app in Xero to get a *CLIENT_ID* and *CLIENT_SECRET*.

* Create a free Xero user account (if you don't have one) 
* Login to Xero Developer center https://developer.xero.com/myapps
* Click "New App"
* Enter your app details (the redirect URI for this app is: `http://localhost:5000/callback`)  This URI does not need to be Internet-accessible.
* Click "Create App"
* Click "Generate a secret"
* Create a `.env` file in the root of your project or rename & replace the vars in the provided `sample.env` file
> `touch .env`
```
CLIENT_ID=...
CLIENT_SECRET=...
REDIRECT_URI=http://localhost:5000/callback
```

The redirect URI configured for the app created at https://developer.xero.com/myapps must match the REDIRECT_URI variable otherwise an "Invalid URI" error will be reported when attempting the initial connection to Xero.

### Build and run

```sh
npm install
npm run start-dev
```

*THIS APP WILL INTERACT WITH YOUR XERO ORG DATABASE. DO NOT CONNECT TO IT WITH A PRODUCTION ACCOUNTING ORG!*

Set up a *Demo Company* if you plan on exploring all the routes: https://developer.xero.com/documentation/getting-started/development-accounts

## Project structure
The project is best explored by cloning/running the app. While we've tried to keep dependencies at a minumum, we have chosen certain tools such as express and jwt-decode to make it easier to show practical usage of the SDK.

The bulk of the helpful code is in `src/app.ts` - each SDK function is grouped by its corresponding object model and can be read about in more depth in the corresponding API set's documentation on our developer portal: https://developer.xero.com/documentation/api/api-overview

We've done our best to make each route [idempotent](https://www.restapitutorial.com/lessons/idempotency.html). Most routes will run through the group of CRUD like actions for each model, showing practical usage for most every API interaction you might need. 

> For example the `Invoices` endpoint (`router.get("/invoices"`) will show the all data dependencies you will often be required to interact with in order to successfully interact with that endpoint. ex. How to import and setup expected types, structuring of params `contact: { contactID: contactID }`, or dependent objects or expected account codes that are not always obvious due to the complexity of financial accounting data.

However, please be aware that based on the Organisation region, chart of accounts, or other data discrepency that certain routes may return an error. If its not obvious by the validation error, ex. "Account code '500' is not a valid code for this document." please raise an issue and we will try to get it sorted for you.

# Token Management

Since typescript will recompile each time the `src` directory is saved this can be a painpoint as the session is wiped out for each server change which includes the tokenSet. To help with this we've set it up to store your previous session in a `/sessions/` file as a low tech/dependency database for this repo. This will enable you to persist the tokenSet, and other utilized data such as the `activeTenant` between re-compiles.

Occasionaly the file based session storage can get out of whack -`UnhandledPromiseRejectionWarning: #<Object>` If you find node hanging on that you can simply delete the sessions in that `/sessions/` folder and start fresh.

### IMPORTANT
**Between each session restart - you will need to visit the root route "/" in order to set the session back onto the XeroClient**

We recommend setting up a proper datastore in your production usage of the `xero-node` project.

# Multiple Organisations

Once you have connected to a Xero org, to connect to an additional org by clicking the Xero logo in the header. This will take you through the auth flow where you can select additional orgs to authorize. You can then choose from a dropdown which tenant you would like to pass to your api calls. Having > 1 org authenticated will also unlock some functionality like the `/disconnect` route.

## Debugging

API Errors will be returned on the response body in an array. If you are working with a batch endpoint like `createContacts` its possible there will be multiple validation errors returned which you can summarize to an array with a batch functions optional `summarizeErrors` parameter.
 
```
response.body.invoices[i].validationErrors

# example errors

"The TaxType code <taxType> does not exist or cannot be used for this type of transaction"
"Account code '<accountCod>' is not a valid code for this document."
```

Also be aware that due to the size of Xero's many API sets, return errors may be structured a bit differently depending on which API set you are working with.

## Contributing
You are very welcome to add/improve functionality - we will continue to make improvements that show more complex API usage like filter/sorting, paginating, and will add more CRUD workflows as new API sets are added to the xero-node SDK. Please open an issue if something is not working correctly.

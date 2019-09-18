import * as express from "express";
import * as bodyParser from "body-parser";
import { Request, Response } from "express";
import { XeroClient, Accounts, Account, AccountType } from "xero-node-sdk";
import * as fs from "fs";
import Helper from './helper';
const mustacheExpress = require('mustache-express');
const session = require('express-session');
const path = require("path");
const localVarRequest = require("request");


// ORANGE
//const client_id = '***REMOVED***'
//const client_secret = '***REMOVED***'

// oauth2 app only
const client_id = '***REMOVED***'
const client_secret = '***REMOVED***'

//const client_id = '***REMOVED***'
//const client_secret = '***REMOVED***'

const redirectUrl = 'http://localhost:5000/callback'
const scopes = 'openid profile email accounting.settings accounting.reports.read accounting.journals.read accounting.contacts accounting.attachments accounting.transactions offline_access'

const xero = new XeroClient({
        clientId: client_id,
        clientSecret: client_secret,
        redirectUris: [redirectUrl],
        scopes: scopes.split(" ")
      });

class App {
  constructor() {
    this.app = express();
    this.config();
    this.routes();
    this.app.engine('html',mustacheExpress());
    this.app.set('view engine', 'html');
    this.app.set('views',__dirname + '/views');
    this.app.use(express.static('public'));
  }

  public app: express.Application;

  private config(): void {
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
  }

  private routes(): void {
    const router = express.Router();

    router.get('/', async (req: Request, res: Response) => {

      try {
        let consentUrl = await xero.buildConsentUrl();
        res.render('index', {url: consentUrl});
      }
       catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/callback', async (req: Request, res: Response) => {
      try {
        let url = "http://localhost:5000/" + req.originalUrl;
        await  xero.setAccessTokenFromRedirectUri(url);
        let accessToken =  await xero.readTokenSet();
        req.session.accessToken = accessToken;
        res.render('callback','');
      }
       catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/accounts', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        //GET ALL
        let accountsGetResponse = await xero.accountingApi.getAccounts(xero.tenantIds[0]);
        //CREATE
        let account: Account = {name: "Foo" + Helper.getRandomNumber(), code: "" + Helper.getRandomNumber(), type: AccountType.EXPENSE};      
        let accountCreateResponse = await xero.accountingApi.createAccount(xero.tenantIds[0],account);
        let accountId = accountCreateResponse.body.accounts[0].accountID;
        //GET ONE
        let accountGetResponse = await xero.accountingApi.getAccount(xero.tenantIds[0],accountId);
        //UPDATE
        let accountUp: Account = {name: "Sidney2 Account" + Helper.getRandomNumber()};      
        let accounts: Accounts = {accounts:[accountUp]};
        let accountUpdateResponse = await xero.accountingApi.updateAccount(xero.tenantIds[0],accountId,accounts);
        

        const filename = 'helo-heros.jpg';
        //const pathToUpload = path.join('src', '__integration_tests__', filename);
        
        const pathToUpload = path.resolve(__dirname, "../public/images/helo-heros.jpg");
        const filesize = fs.statSync(pathToUpload).size;
        const readStream = fs.createReadStream(pathToUpload);

        let attachmentsResponse = await xero.accountingApi.createAccountAttachmentByFileName(xero.tenantIds[0], accountId, filename, readStream, {
            headers: {
                'Content-Type': 'image/jpeg',
                'Content-Length': filesize.toString(),
                'Accept': 'application/json'
            }
        });
        
        //console.log(attachmentsResponse.body.attachments[0].attachmentID);


        //DELETE - tested and works
        /*
        let accountDeleteResponse = await xero.accountingApi.deleteAccount(xero.tenantIds[0],accountID);
        accountDeleteResponse.body.accounts[0].name
        */
        
        res.render('accounts', {
          getAllCount: accountsGetResponse.body.accounts.length,
          getOneName: accountGetResponse.body.accounts[0].name,
          createName: accountCreateResponse.body.accounts[0].name,
          updateName: accountUpdateResponse.body.accounts[0].name,
          deleteName: "temp not passing"
        });
          
     }
       catch (e) { 
          res.status(500);
          res.send(e);
      }
    });

    router.get('/banktransactions', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getBankTransactions(xero.tenantIds[0]);
        res.render('banktransactions', {count: apiResponse.body.bankTransactions.length});
     }
       catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/banktranfers', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getBankTransfers(xero.tenantIds[0]);
        res.render('banktranfers', {count: apiResponse.body.bankTransfers.length});
     }
       catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/batchpayments', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getBatchPayments(xero.tenantIds[0]);
        res.render('batchpayments', {count: apiResponse.body.batchPayments.length});
     }
       catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/brandingthemes', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getBrandingThemes(xero.tenantIds[0]);
        res.render('brandingthemes', {count: apiResponse.body.brandingThemes.length});
     }
       catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/contacts', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getContacts(xero.tenantIds[0]);
        res.render('contacts', {count: apiResponse.body.contacts.length});
     }
       catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/contactgroups', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getContactGroups(xero.tenantIds[0]);
        res.render('contactgroups', {count: apiResponse.body.contactGroups.length});
     }
       catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/creditnotes', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getCreditNotes(xero.tenantIds[0]);
        res.render('creditnotes', {count: apiResponse.body.creditNotes.length});
     }
       catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/currencies', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getCurrencies(xero.tenantIds[0]);
        res.render('currencies', {count: apiResponse.body.currencies.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/employees', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getEmployees(xero.tenantIds[0]);
        res.render('employees', {count: apiResponse.body.employees.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/expenseclaims', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getExpenseClaims(xero.tenantIds[0]);
        res.render('expenseclaims', {count: apiResponse.body.expenseClaims.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/invoicereminders', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getInvoiceReminders(xero.tenantIds[0]);
        res.render('invoicereminders', {count: apiResponse.body.invoiceReminders.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/invoices', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getInvoices(xero.tenantIds[0]);
        res.render('invoices', {count: apiResponse.body.invoices.length});
      } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/items', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getItems(xero.tenantIds[0]);
        res.render('items', {count: apiResponse.body.items.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/journals', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getJournals(xero.tenantIds[0]);
        res.render('journals', {count: apiResponse.body.journals.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/manualjournals', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getManualJournals(xero.tenantIds[0]);
        res.render('manualjournals', {count: apiResponse.body.manualJournals.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/organisations', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getOrganisations(xero.tenantIds[0]);
        res.render('organisations', {name: apiResponse.body.organisations[0].name});
      } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/overpayments', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getOverpayments(xero.tenantIds[0]);
        res.render('overpayments', {count: apiResponse.body.overpayments.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/payments', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getPayments(xero.tenantIds[0]);
        res.render('payments', {count: apiResponse.body.payments.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/paymentservices', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getPaymentServices(xero.tenantIds[0]);
        res.render('paymentservices', {count: apiResponse.body.paymentServices.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/prepayments', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getPrepayments(xero.tenantIds[0]);
        res.render('prepayments', {count: apiResponse.body.prepayments.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/purchaseorders', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getPurchaseOrders(xero.tenantIds[0]);
        res.render('purchaseorders', {count: apiResponse.body.purchaseOrders.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/receipts', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getReceipts(xero.tenantIds[0]);
        res.render('receipts', {count: apiResponse.body.receipts.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/reports', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        
        //We need specific report API calls
        //let apiResponse = await xero.accountingApi.getReports(xero.tenantIds[0]);
        res.render('reports', {count: 0});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/taxrates', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getTaxRates(xero.tenantIds[0]);
        res.render('taxrates', {count: apiResponse.body.taxRates.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/trackingcategories', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getTrackingCategories(xero.tenantIds[0]);
        res.render('trackingcategories', {count: apiResponse.body.trackingCategories.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    router.get('/users', async (req: Request, res: Response) => {
      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        let apiResponse = await xero.accountingApi.getUsers(xero.tenantIds[0]);
        res.render('users', {count: apiResponse.body.users.length});
     } catch (e) {
          res.status(500);
          res.send(e);
      }
    });

    this.app.use(session({
      secret: 'something crazy',
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false }
    }));

    this.app.use('/', router)

  }  
}

export default new App().app;
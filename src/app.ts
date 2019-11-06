require('dotenv').config()
import express from "express";
import * as bodyParser from "body-parser";
import { Request, Response } from "express";
import { XeroClient, Accounts, Account, AccountType, BankTransaction, BankTransactions, BankTransfer, BankTransfers, Contact, LineItem } from "xero-node";
import * as fs from "fs";
import Helper from './helper';
const session = require('express-session');
const path = require("path");
const mime = require('mime-types')

const client_id = process.env.CLIENT_ID
const client_secret = process.env.CLIENT_SECRET
const redirectUrl = process.env.REDIRECT_URI
const scopes = 'openid profile email accounting.settings accounting.reports.read accounting.journals.read accounting.contacts accounting.attachments accounting.transactions offline_access'

const xero = new XeroClient({
        clientId: client_id,
        clientSecret: client_secret,
        redirectUris: [redirectUrl],
        scopes: scopes.split(" ")
      });

class App {
  public app: express.Application;
  
  constructor() {
    this.app = express();
    this.config();
    this.routes();

    this.app.set('view engine', 'ejs');
    this.app.use(express.static(__dirname + '/public'));
  }

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
        req.session.accessToken = accessToken
        res.render('callback');
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
        let accountUp: Account = {name: "Bar" + Helper.getRandomNumber()};
        let accounts: Accounts = {accounts:[accountUp]};
        let accountUpdateResponse = await xero.accountingApi.updateAccount(xero.tenantIds[0],accountId,accounts);

        // CREATE ATTACHMENT
        const filename = 'xero-dev.jpg';
        const pathToUpload = path.resolve(__dirname, "../public/images/xero-dev.jpg");
        const filesize = fs.statSync(pathToUpload).size;
        const readStream = fs.createReadStream(pathToUpload);
        const contentType = mime.lookup(filename);
  
        let accountAttachmentsResponse = await xero.accountingApi.createAccountAttachmentByFileName(xero.tenantIds[0], accountId, filename, readStream, {
          headers: {
            'Content-Type': contentType
          }
        });

        console.log(accountAttachmentsResponse.body);

        //GET ATTACHMENTS
        let accountAttachmentsGetResponse = await xero.accountingApi.getAccountAttachments(xero.tenantIds[0],accountId);
        let attachmentId = accountAttachmentsResponse.body.attachments[0].attachmentID;
        let attachmentMimeType = accountAttachmentsResponse.body.attachments[0].mimeType;
        let attachmentFileName = accountAttachmentsResponse.body.attachments[0].fileName;

        //GET ATTACHMENT BY ID
        let accountAttachmentsGetByIdResponse = await xero.accountingApi.getAccountAttachmentById(xero.tenantIds[0],accountId, attachmentId, attachmentMimeType);
        console.log(accountAttachmentsGetByIdResponse.body.length);
        fs.writeFile(`id-${attachmentFileName}`, accountAttachmentsGetByIdResponse.body, err => {
          if (err) throw err;
          console.log('file written successfully');
        });

        //GET ATTACHMENT BY FILENAME
        let accountAttachmentsGetByFilenameResponse = await xero.accountingApi.getAccountAttachmentByFileName(xero.tenantIds[0],accountId, attachmentFileName, attachmentMimeType);
        console.log(accountAttachmentsGetByFilenameResponse.body.length);
        fs.writeFile(`filename-${attachmentFileName}`, accountAttachmentsGetByFilenameResponse.body, err => {
          if (err) throw err;
          console.log('file written successfully');
        });

        console.log(accountId);
        //DELETE
        //let accountDeleteResponse = await xero.accountingApi.deleteAccount(xero.tenantIds[0],accountId);

        res.render('accounts', {
          accountsCount: accountsGetResponse.body.accounts.length,
          getOneName: accountGetResponse.body.accounts[0].name,
          createName: accountCreateResponse.body.accounts[0].name,
          updateName: accountUpdateResponse.body.accounts[0].name,
          createAttachmentId: accountAttachmentsResponse.body.attachments[0].attachmentID,
          attachmentsCount: accountAttachmentsGetResponse.body.attachments.length,
          deleteName: 'temp'
        });
        //accountDeleteResponse.body.accounts[0].name

     }
       catch (e) {
          res.status(500);
          res.send(e);
      }
    });


    router.get('/banktransactions', async (req: Request, res: Response) => {
      try {
        let accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);

        //GET ALL
        let bankTransactionsGetResponse = await xero.accountingApi.getBankTransactions(xero.tenantIds[0]);

        //CREATE
        let contactsResponse = await xero.accountingApi.getContacts(xero.tenantIds[0]);
        let useContact: Contact = { contactID: contactsResponse.body.contacts[0].contactID };

        let lineItems: Array<LineItem> = [{
          description: 'consulting',
          quantity: 1.0,
          unitAmount: 20.0,
          accountCode: '200'
        }];
        let where = 'Status=="' + Account.StatusEnum.ACTIVE + '" AND Type=="' + Account.BankAccountTypeEnum.BANK + '"';
        let accountsResponse = await xero.accountingApi.getAccounts(xero.tenantIds[0], null, where);
        let useBankAccount: Account = { accountID: accountsResponse.body.accounts[0].accountID }

        let newBankTransaction: BankTransaction = {
          type: BankTransaction.TypeEnum.SPEND,
          contact: useContact,
          lineItems: lineItems,
          bankAccount: useBankAccount,
          date: '2019-09-19T00:00:00',
        };
        let bankTransactionCreateResponse = await xero.accountingApi.createBankTransaction(xero.tenantIds[0], newBankTransaction);

        //GET ONE
        let bankTransactionId = bankTransactionCreateResponse.body.bankTransactions[0].bankTransactionID;
        let bankTransactionGetResponse = await xero.accountingApi.getBankTransaction(xero.tenantIds[0], bankTransactionId);

        //UPDATE status to deleted
        var bankTransactionUp = Object.assign({}, bankTransactionGetResponse.body.bankTransactions[0]);
        delete bankTransactionUp.updatedDateUTC;
        delete bankTransactionUp.contact; // also has an updatedDateUTC
        bankTransactionUp.status = BankTransaction.StatusEnum.DELETED;
        let bankTransactions: BankTransactions = { bankTransactions: [bankTransactionUp] };
        let bankTransactionUpdateResponse = await xero.accountingApi.updateBankTransaction(xero.tenantIds[0], bankTransactionId, bankTransactions)

        res.render('banktransactions', {
          bankTransactionsCount: bankTransactionsGetResponse.body.bankTransactions.length,
          createID: bankTransactionCreateResponse.body.bankTransactions[0].bankTransactionID,
          getOneStatus: bankTransactionGetResponse.body.bankTransactions[0].type,
          updatedStatus: bankTransactionUpdateResponse.body.bankTransactions[0].status,
        });
      }
      catch (e) {
        console.error(e);
        res.status(500);
        res.send(e);
      }
    });


    router.get('/banktranfers', async (req: Request, res: Response) => {

      //FIRST check if two bank accounts exist!!

      try {
        let accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        //GET ALL
        let apiResponse = await xero.accountingApi.getBankTransfers(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getBatchPayments(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getBrandingThemes(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getContacts(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getContactGroups(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getCreditNotes(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getCurrencies(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getEmployees(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getExpenseClaims(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getInvoiceReminders(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getInvoices(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getItems(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getJournals(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getManualJournals(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getOrganisations(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getOverpayments(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getPayments(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getPaymentServices(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getPrepayments(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getPurchaseOrders(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
        let apiResponse = await xero.accountingApi.getReceipts(xero.tenantIds[0]);
        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL

        //CREATE
        //GET ONE
        //UPDATE
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
        //GET ALL
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
        //GET ALL
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
        //GET ALL
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
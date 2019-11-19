require("dotenv").config();
import * as bodyParser from "body-parser";
import express from "express";
import { Request, Response } from "express";
import * as fs from "fs";
import { Account, Accounts, AccountType, BankTransaction, BankTransactions, BankTransfer, BankTransfers, Contact, LineItem, XeroClient } from "xero-node";
import Helper from "./helper";
import jwtDecode from 'jwt-decode';

const session = require("express-session");
const path = require("path");
const mime = require("mime-types");

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirectUrl = process.env.REDIRECT_URI;
const scopes = "openid profile email accounting.settings accounting.reports.read accounting.journals.read accounting.contacts accounting.attachments accounting.transactions offline_access";

interface XeroJwt {
  nbf: number
  exp: number
  iss: string,
  aud: string
  iat: number
  at_hash: string
  sid: string
  sub: string
  auth_time: number
  idp: string
  xero_userid: string
  global_session_id: string
  preferred_username: string
  email: string
  given_name: string
  family_name: string
  amr: string[]
}

interface XeroAccessToken {
  nbf: number
  exp: number
  iss: string
  aud: string
  client_id: string
  sub: string
  auth_time: number
  idp: string
  xero_userid: string
  global_session_id: string
  jti: string
  scope: string[]
  amr: string[]
}

const xero = new XeroClient({
        clientId: client_id,
        clientSecret: client_secret,
        redirectUris: [redirectUrl],
        scopes: scopes.split(" "),
      });

const consentUrl = xero.buildConsentUrl();
const allTenants = []

class App {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.config();
    this.routes();

    this.app.set( "views", path.join( __dirname, "views" ) );
    this.app.set("view engine", "ejs");
    this.app.use(express.static( path.join( __dirname, "public" )));
  }

  private config(): void {
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
    
    // global session variables
    this.app.use(function(req, res, next) {
      res.locals.consentUrl = consentUrl
      res.locals.allTenants = allTenants
      next();
    });
  }

  // helpers
  authenticationData(req, _res) {
    return {
      decodedIdToken: req.session.decodedIdToken,
      decodedAccessToken: req.session.decodedAccessToken,
    }
  }

  private routes(): void {
    const router = express.Router();

    router.get("/", async (req: Request, res: Response) => {


      asdfasdf'asdfas'


      try {
        const consentUrl = await xero.buildConsentUrl();
        const authData = this.authenticationData(req, res)
        res.render("home", { 
          consentUrl: authData.decodedAccessToken ? undefined : consentUrl,
          authenticated: authData
        });
      } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/callback", async (req: Request, res: Response) => {
      try {
        const url = "http://localhost:5000/" + req.originalUrl;
        await xero.setAccessTokenFromRedirectUri(url);
        const accessToken = await xero.readTokenSet();

        const decodedIdToken: XeroJwt = jwtDecode(accessToken.id_token);
        req.session.decodedIdToken = decodedIdToken

        const decodedAccessToken: XeroAccessToken = jwtDecode(accessToken.access_token)
        req.session.decodedAccessToken = decodedAccessToken

        res.locals.allTenants = xero.tenantIds
        res.locals.activeTenant = xero.tenantIds[0]

        req.session.accessToken = accessToken;
        res.render("callback", {
          authenticated: this.authenticationData(req, res)
        });
      } catch (e) {
        console.log(e)
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/accounts", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);

        // GET ALL
        const accountsGetResponse = await xero.accountingApi.getAccounts(res.locals.activeTenant);

        // CREATE
        const account: Account = {name: "Foo" + Helper.getRandomNumber(), code: "" + Helper.getRandomNumber(), type: AccountType.EXPENSE};
        const accountCreateResponse = await xero.accountingApi.createAccount(res.locals.activeTenant,account);
        const accountId = accountCreateResponse.body.accounts[0].accountID;

        // GET ONE
        const accountGetResponse = await xero.accountingApi.getAccount(res.locals.activeTenant,accountId);

        // UPDATE
        const accountUp: Account = {name: "Bar" + Helper.getRandomNumber()};
        const accounts: Accounts = {accounts:[accountUp]};
        const accountUpdateResponse = await xero.accountingApi.updateAccount(res.locals.activeTenant,accountId,accounts);

        // CREATE ATTACHMENT
        const filename = "xero-dev.jpg";
        const pathToUpload = path.resolve(__dirname, "../public/images/xero-dev.jpg");
        // const filesize = fs.statSync(pathToUpload).size;
        const readStream = fs.createReadStream(pathToUpload);
        const contentType = mime.lookup(filename);

        const accountAttachmentsResponse = await xero.accountingApi.createAccountAttachmentByFileName(res.locals.activeTenant, accountId, filename, readStream, {
          headers: {
            "Content-Type": contentType,
          },
        });

        console.log(accountAttachmentsResponse.body);

        // GET ATTACHMENTS
        const accountAttachmentsGetResponse = await xero.accountingApi.getAccountAttachments(res.locals.activeTenant,accountId);
        const attachmentId = accountAttachmentsResponse.body.attachments[0].attachmentID;
        const attachmentMimeType = accountAttachmentsResponse.body.attachments[0].mimeType;
        const attachmentFileName = accountAttachmentsResponse.body.attachments[0].fileName;

        // GET ATTACHMENT BY ID
        const accountAttachmentsGetByIdResponse = await xero.accountingApi.getAccountAttachmentById(res.locals.activeTenant,accountId, attachmentId, attachmentMimeType);
        console.log(accountAttachmentsGetByIdResponse.body.length);
        fs.writeFile(`id-${attachmentFileName}`, accountAttachmentsGetByIdResponse.body, (err) => {
          if (err) { throw err; }
          console.log("file written successfully");
        });

        // GET ATTACHMENT BY FILENAME
        const accountAttachmentsGetByFilenameResponse = await xero.accountingApi.getAccountAttachmentByFileName(res.locals.activeTenant,accountId, attachmentFileName, attachmentMimeType);
        console.log(accountAttachmentsGetByFilenameResponse.body.length);
        fs.writeFile(`filename-${attachmentFileName}`, accountAttachmentsGetByFilenameResponse.body, (err) => {
          if (err) { throw err; }
          console.log("file written successfully");
        });

        console.log(accountId);
        // DELETE
        // let accountDeleteResponse = await xero.accountingApi.deleteAccount(res.locals.activeTenant,accountId);

        res.render("accounts", {
          accountsCount: accountsGetResponse.body.accounts.length,
          getOneName: accountGetResponse.body.accounts[0].name,
          createName: accountCreateResponse.body.accounts[0].name,
          updateName: accountUpdateResponse.body.accounts[0].name,
          createAttachmentId: accountAttachmentsResponse.body.attachments[0].attachmentID,
          attachmentsCount: accountAttachmentsGetResponse.body.attachments.length,
          deleteName: "temp",
        });
        // accountDeleteResponse.body.accounts[0].name

     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/banktransactions", async (req: Request, res: Response) => {
      try {
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);

        // GET ALL
        const bankTransactionsGetResponse = await xero.accountingApi.getBankTransactions(res.locals.activeTenant);

        // CREATE

        const contactsResponse = await xero.accountingApi.getContacts(res.locals.activeTenant);
        const useContact: Contact = { contactID: contactsResponse.body.contacts[0].contactID };

        // Fetch Accounts
        const where = 'Status=="' + Account.StatusEnum.ACTIVE + '" AND Type=="' + Account.BankAccountTypeEnum.BANK + '"';
        console.log('where: ',where)

        const accountsResponse = await xero.accountingApi.getAccounts(res.locals.activeTenant, null, where);

        console.log('accountsResponse:',accountsResponse)

        const lineItems: LineItem[] = [{
          description: "consulting",
          quantity: 1.0,
          unitAmount: 20.0,
          accountCode: "200",
        }];
        console.log('lineItems: ', lineItems)

        const useBankAccount: Account = { accountID: accountsResponse.body.accounts[0].accountID };
        console.log('useBankAccount: ', useBankAccount)

        const newBankTransaction: BankTransaction = {
          type: BankTransaction.TypeEnum.SPEND,
          contact: useContact,
          lineItems,
          bankAccount: useBankAccount,
          date: "2019-09-19T00:00:00",
        };
        console.log('newBankTransaction: ',newBankTransaction)
        const bankTransactionCreateResponse = await xero.accountingApi.createBankTransaction(res.locals.activeTenant, newBankTransaction);

        // GET ONE
        const bankTransactionId = bankTransactionCreateResponse.body.bankTransactions[0].bankTransactionID;
        const bankTransactionGetResponse = await xero.accountingApi.getBankTransaction(res.locals.activeTenant, bankTransactionId);

        // UPDATE status to deleted
        const bankTransactionUp = Object.assign({}, bankTransactionGetResponse.body.bankTransactions[0]);
        delete bankTransactionUp.updatedDateUTC;
        delete bankTransactionUp.contact; // also has an updatedDateUTC
        bankTransactionUp.status = BankTransaction.StatusEnum.DELETED;
        const bankTransactions: BankTransactions = { bankTransactions: [bankTransactionUp] };
        const bankTransactionUpdateResponse = await xero.accountingApi.updateBankTransaction(res.locals.activeTenant, bankTransactionId, bankTransactions);

        res.render("banktransactions", {
          bankTransactionsCount: bankTransactionsGetResponse.body.bankTransactions.length,
          createID: bankTransactionCreateResponse.body.bankTransactions[0].bankTransactionID,
          getOneStatus: bankTransactionGetResponse.body.bankTransactions[0].type,
          updatedStatus: bankTransactionUpdateResponse.body.bankTransactions[0].status,
        });
      } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/banktranfers", async (req: Request, res: Response) => {

      // FIRST check if two bank accounts exist!!

      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getBankTransfers(res.locals.activeTenant);
        // CREATE

        // BankTransfer
        // GET ONE
        // UPDATE
        res.render("banktranfers", {count: apiResponse.body.bankTransfers.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/batchpayments", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getBatchPayments(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("batchpayments", {count: apiResponse.body.batchPayments.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/brandingthemes", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getBrandingThemes(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("brandingthemes", {count: apiResponse.body.brandingThemes.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/contacts", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getContacts(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("contacts", {count: apiResponse.body.contacts.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/contactgroups", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getContactGroups(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("contactgroups", {count: apiResponse.body.contactGroups.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/creditnotes", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getCreditNotes(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("creditnotes", {count: apiResponse.body.creditNotes.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/currencies", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getCurrencies(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("currencies", {count: apiResponse.body.currencies.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/employees", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getEmployees(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("employees", {count: apiResponse.body.employees.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/expenseclaims", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getExpenseClaims(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("expenseclaims", {count: apiResponse.body.expenseClaims.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/invoicereminders", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getInvoiceReminders(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("invoicereminders", {count: apiResponse.body.invoiceReminders.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/invoices", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getInvoices(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("invoices", {count: apiResponse.body.invoices.length});
      } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/items", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getItems(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("items", {count: apiResponse.body.items.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/journals", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getJournals(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("journals", {count: apiResponse.body.journals.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/manualjournals", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getManualJournals(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("manualjournals", {count: apiResponse.body.manualJournals.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/organisations", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getOrganisations(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("organisations", {name: apiResponse.body.organisations[0].name});
      } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/overpayments", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getOverpayments(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("overpayments", {count: apiResponse.body.overpayments.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/payments", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getPayments(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("payments", {count: apiResponse.body.payments.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/paymentservices", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getPaymentServices(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("paymentservices", {count: apiResponse.body.paymentServices.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/prepayments", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getPrepayments(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("prepayments", {count: apiResponse.body.prepayments.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/purchaseorders", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getPurchaseOrders(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("purchaseorders", {count: apiResponse.body.purchaseOrders.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/receipts", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getReceipts(res.locals.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("receipts", {count: apiResponse.body.receipts.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/reports", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL

        // CREATE
        // GET ONE
        // UPDATE
        // We need specific report API calls
        // let apiResponse = await xero.accountingApi.getReports(res.locals.activeTenant);
        res.render("reports", {count: 0});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/taxrates", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getTaxRates(res.locals.activeTenant);
        console.log(apiResponse.body);

        res.render("taxrates", {count: apiResponse.body.taxRates.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/trackingcategories", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getTrackingCategories(res.locals.activeTenant);
        res.render("trackingcategories", {count: apiResponse.body.trackingCategories.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/users", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getUsers(res.locals.activeTenant);
        res.render("users", {count: apiResponse.body.users.length});
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    this.app.use(session({
      secret: "something crazy",
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false },
    }));

    this.app.use("/", router);

  }
}

export default new App().app;

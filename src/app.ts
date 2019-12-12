require("dotenv").config();
import * as bodyParser from "body-parser";
import express from "express";
import { Request, Response } from "express";
import * as fs from "fs";
import { Account, Accounts, AccountType, BankTransaction, BankTransactions, BankTransfer, BankTransfers, Contact, Contacts, Item, Items, LineItem, XeroClient } from "xero-node";
import Helper from "./helper";
import jwtDecode from 'jwt-decode';
import { XeroBankFeedClient, FeedConnection, FeedConnections, CurrencyCode } from "xero-node-bankfeeds";

const session = require("express-session");
const path = require("path");
const mime = require("mime-types");

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirectUrl = process.env.REDIRECT_URI;
const scopes = "openid profile email accounting.settings accounting.reports.read accounting.journals.read accounting.contacts accounting.attachments accounting.transactions offline_access";
// bankfeeds

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

const xero_bankfeeds = new XeroBankFeedClient({
        clientId: client_id,
        clientSecret: client_secret,
        redirectUris: [redirectUrl],
        scopes: scopes.split(" "),
      });

const consentUrl = xero.buildConsentUrl();

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

      next();
    });
  }

  // helpers
  authenticationData(req, _res) {
    return {
      decodedIdToken: req.session.decodedIdToken,
      decodedAccessToken: req.session.decodedAccessToken,
      allTenants: req.session.allTenants,
      activeTenant: req.session.activeTenant
    }
  }

  private routes(): void {
    const router = express.Router();

    router.get("/", async (req: Request, res: Response) => {

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

    // OAuth2 now authenticates at the user level instead of the organisation level
    // Loop and get org names
    router.post("/change_organisation", async (req: Request, res: Response) => {
      try {
        const activeOrgId = req.body.active_org_id
        req.session.activeTenant = activeOrgId
        const authData = this.authenticationData(req, res)

        res.render("home", {
          consentUrl: authData.decodedAccessToken ? undefined : consentUrl,
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

    router.get("/callback", async (req: Request, res: Response) => {
      try {
        const url = "http://localhost:5000/" + req.originalUrl;
        await xero.setAccessTokenFromRedirectUri(url);
        const accessToken = await xero.readTokenSet();

        const decodedIdToken: XeroJwt = jwtDecode(accessToken.id_token);
        req.session.decodedIdToken = decodedIdToken

        const decodedAccessToken: XeroAccessToken = jwtDecode(accessToken.access_token)
        req.session.decodedAccessToken = decodedAccessToken
        req.session.accessToken = accessToken;
        req.session.allTenants = xero.tenantIds
        req.session.activeTenant = xero.tenantIds[0]

        const authData = this.authenticationData(req, res)

        res.render("callback", {
          consentUrl: authData.decodedAccessToken ? undefined : consentUrl,
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
        const accountsGetResponse = await xero.accountingApi.getAccounts(req.session.activeTenant);

        // CREATE
        const account: Account = { name: "Foo" + Helper.getRandomNumber(), code: "" + Helper.getRandomNumber(), type: AccountType.EXPENSE };
        const accountCreateResponse = await xero.accountingApi.createAccount(req.session.activeTenant, account);
        const accountId = accountCreateResponse.body.accounts[0].accountID;

        // GET ONE
        const accountGetResponse = await xero.accountingApi.getAccount(req.session.activeTenant, accountId);

        // UPDATE
        const accountUp: Account = { name: "Bar" + Helper.getRandomNumber() };
        const accounts: Accounts = { accounts:[accountUp] };
        const accountUpdateResponse = await xero.accountingApi.updateAccount(req.session.activeTenant, accountId,accounts);

        // CREATE ATTACHMENT
        const filename = "xero-dev.jpg";
        const pathToUpload = path.resolve(__dirname, "../public/images/xero-dev.jpg");
        // const filesize = fs.statSync(pathToUpload).size;
        const readStream = fs.createReadStream(pathToUpload);
        const contentType = mime.lookup(filename);

        const accountAttachmentsResponse = await xero.accountingApi.createAccountAttachmentByFileName(req.session.activeTenant,  accountId, filename, readStream, {
          headers: {
            "Content-Type": contentType,
          },
        });

        console.log(accountAttachmentsResponse.body);

        // GET ATTACHMENTS
        const accountAttachmentsGetResponse = await xero.accountingApi.getAccountAttachments(req.session.activeTenant, accountId);
        const attachmentId = accountAttachmentsResponse.body.attachments[0].attachmentID;
        const attachmentMimeType = accountAttachmentsResponse.body.attachments[0].mimeType;
        const attachmentFileName = accountAttachmentsResponse.body.attachments[0].fileName;

        // GET ATTACHMENT BY ID
        const accountAttachmentsGetByIdResponse = await xero.accountingApi.getAccountAttachmentById(req.session.activeTenant, accountId, attachmentId, attachmentMimeType);
        console.log(accountAttachmentsGetByIdResponse.body.length);
        fs.writeFile(`id-${attachmentFileName}`, accountAttachmentsGetByIdResponse.body, (err) => {
          if (err) { throw err; }
          console.log("file written successfully");
        });

        // GET ATTACHMENT BY FILENAME
        const accountAttachmentsGetByFilenameResponse = await xero.accountingApi.getAccountAttachmentByFileName(req.session.activeTenant, accountId, attachmentFileName, attachmentMimeType);
        console.log(accountAttachmentsGetByFilenameResponse.body.length);
        fs.writeFile(`filename-${attachmentFileName}`, accountAttachmentsGetByFilenameResponse.body, (err) => {
          if (err) { throw err; }
          console.log("file written successfully");
        });

        // DELETE
        let accountDeleteResponse = await xero.accountingApi.deleteAccount(req.session.activeTenant, accountId);

        res.render("accounts", {
          consentUrl: await xero.buildConsentUrl(),
          authenticated: this.authenticationData(req, res),
          accountsCount: accountsGetResponse.body.accounts.length,
          getOneName: accountGetResponse.body.accounts[0].name,
          createName: accountCreateResponse.body.accounts[0].name,
          updateName: accountUpdateResponse.body.accounts[0].name,
          createAttachmentId: accountAttachmentsResponse.body.attachments[0].attachmentID,
          attachmentsCount: accountAttachmentsGetResponse.body.attachments.length,
          deleteName: accountDeleteResponse.body.accounts[0].name
        });
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
        const bankTransactionsGetResponse = await xero.accountingApi.getBankTransactions(req.session.activeTenant);

        // CREATE
        const contactsResponse = await xero.accountingApi.getContacts(req.session.activeTenant);
        const useContact: Contact = { contactID: contactsResponse.body.contacts[0].contactID };

        const allAccounts = await xero.accountingApi.getAccounts(req.session.activeTenant);
        const validAccountCode = allAccounts.body.accounts.filter(e => !['NONE','BASEXCLUDED'].includes(e.taxType))[0].code

        const lineItems: LineItem[] = [{
          description: "consulting",
          quantity: 1.0,
          unitAmount: 20.0,
          accountCode: validAccountCode,
        }];
        const where = 'Status=="' + Account.StatusEnum.ACTIVE + '" AND Type=="' + Account.BankAccountTypeEnum.BANK + '"';
        const accountsResponse = await xero.accountingApi.getAccounts(req.session.activeTenant,  null, where);
        const useBankAccount: Account = { accountID: accountsResponse.body.accounts[0].accountID };

        const newBankTransaction: BankTransaction = {
          type: BankTransaction.TypeEnum.SPEND,
          contact: useContact,
          lineItems,
          bankAccount: useBankAccount,
          date: "2019-09-19T00:00:00",
        };
        const bankTransactionCreateResponse = await xero.accountingApi.createBankTransaction(req.session.activeTenant, newBankTransaction);

        // GET ONE
        const bankTransactionId = bankTransactionCreateResponse.body.bankTransactions[0].bankTransactionID;
        const bankTransactionGetResponse = await xero.accountingApi.getBankTransaction(req.session.activeTenant, bankTransactionId);

        // UPDATE status to deleted
        const bankTransactionUp = Object.assign({}, bankTransactionGetResponse.body.bankTransactions[0]);
        delete bankTransactionUp.updatedDateUTC;
        delete bankTransactionUp.contact; // also has an updatedDateUTC
        bankTransactionUp.status = BankTransaction.StatusEnum.DELETED;
        const bankTransactions: BankTransactions = { bankTransactions: [bankTransactionUp] };
        const bankTransactionUpdateResponse = await xero.accountingApi.updateBankTransaction(req.session.activeTenant, bankTransactionId, bankTransactions);

        res.render("banktransactions", {
          authenticated: this.authenticationData(req, res),
          bankTransactionsCount: bankTransactionsGetResponse.body.bankTransactions.length,
          createID: bankTransactionCreateResponse.body.bankTransactions[0].bankTransactionID,
          getOneStatus: bankTransactionGetResponse.body.bankTransactions[0].type,
          updatedStatus: bankTransactionUpdateResponse.body.bankTransactions[0].status,
        });
      } catch (e) {
        console.error(e);
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/banktranfers", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await xero.setTokenSet(accessToken);
         // GET ALL
         const getBankTransfersResult = await xero.accountingApi.getBankTransfers(req.session.activeTenant);
         console.log('getBankTransfer.body.bankTransfers: ', getBankTransfersResult.body.bankTransfers)
         
        // CREATE
        // FIRST we need two Accounts type=BANK
        const account1: Account = {
          name: "Ima Bank: " + Helper.getRandomNumber(),
          code: "" + Helper.getRandomNumber(),
          type: AccountType.BANK,
          bankAccountNumber: Helper.getRandomNumber().toString()
        };
        const account2: Account = {
          name: "Ima Bank: " + Helper.getRandomNumber(),
          code: "" + Helper.getRandomNumber(),
          type: AccountType.BANK,
          bankAccountNumber: Helper.getRandomNumber().toString()
        };
        const created1 = await xero.accountingApi.createAccount(req.session.activeTenant, account1);
        const created2 = await xero.accountingApi.createAccount(req.session.activeTenant, account2);
        const acc1 = created1.body.accounts[0]
        const acc2 = created2.body.accounts[0]

        console.log('acc1: ',acc1)
        console.log('acc2: ',acc2)

        // then we can create a bank transer
        const bankTransfer: BankTransfer = {
          fromBankAccount: {
            accountID: acc1.accountID,
            name: acc1.name
          },
          toBankAccount: {
            accountID: acc2.accountID,
            name: acc2.name
          },
          amount: '1000'
        }

        const bankTransfers: BankTransfers = { bankTransfers: [bankTransfer] }
        const createBankTransfer = await xero.accountingApi.createBankTransfer(req.session.activeTenant, bankTransfers);

        // GET ONE
        const getBankTransfer = await xero.accountingApi.getBankTransfer(req.session.activeTenant, createBankTransfer.body.bankTransfers[0].bankTransferID)
       
        res.render("banktranfers", {
          authenticated: this.authenticationData(req, res),
          allBankTransfers: getBankTransfersResult.body.bankTransfers,
          createBankTransferId: createBankTransfer.body.bankTransfers[0].bankTransferID,
          getBankTransferId: getBankTransfer.body.bankTransfers[0].bankTransferID
        });
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
        const apiResponse = await xero.accountingApi.getBatchPayments(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("batchpayments", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.batchPayments.length
        });
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
        const apiResponse = await xero.accountingApi.getBrandingThemes(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("brandingthemes", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.brandingThemes.length
        });
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
        const contactsGetResponse = await xero.accountingApi.getContacts(req.session.activeTenant);

        // CREATE
        const contact: Contact = { name: "Contact Foo Bar" + Helper.getRandomNumber(), firstName: "Foo", lastName: "Bar", emailAddress: "foo.bar@example.com" };
        const contactCreateResponse = await xero.accountingApi.createContact(req.session.activeTenant, contact);
        const contactId = contactCreateResponse.body.contacts[0].contactID;

        // GET ONE
        const contactGetResponse = await xero.accountingApi.getContact(req.session.activeTenant, contactId);

        // UPDATE
        const contactUpdate: Contact = { name: "Contact Foo Bar" + Helper.getRandomNumber() };
        const contacts: Contacts = { contacts:[contactUpdate] };
        const contactUpdateResponse = await xero.accountingApi.updateContact(req.session.activeTenant, contactId, contacts);

        res.render("contacts", {
          consentUrl: await xero.buildConsentUrl(),
          authenticated: this.authenticationData(req, res),
          contactsCount: contactsGetResponse.body.contacts.length,
          createName: contactCreateResponse.body.contacts[0].name,
          getOneName: contactGetResponse.body.contacts[0].name,
          updateName: contactUpdateResponse.body.contacts[0].name,
        });
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
        const apiResponse = await xero.accountingApi.getContactGroups(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("contactgroups", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.contactGroups.length
        });
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
        const apiResponse = await xero.accountingApi.getCreditNotes(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("creditnotes", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.creditNotes.length
        });
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
        const apiResponse = await xero.accountingApi.getCurrencies(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("currencies", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.currencies.length
        });
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
        const apiResponse = await xero.accountingApi.getEmployees(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("employees", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.employees.length
        });
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
        const apiResponse = await xero.accountingApi.getExpenseClaims(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("expenseclaims", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.expenseClaims.length
        });
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
        const apiResponse = await xero.accountingApi.getInvoiceReminders(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("invoicereminders", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.invoiceReminders.length
        });
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
        const apiResponse = await xero.accountingApi.getInvoices(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("invoices", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.invoices.length
        });
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
        const itemsGetResponse = await xero.accountingApi.getItems(req.session.activeTenant);

        // CREATE
        const item: Item = {
          code: "Foo" + Helper.getRandomNumber(),
          name: "Bar",
          purchaseDetails: {
            unitPrice: 375.5000,
            taxType: "NONE",
            accountCode: "500",
            cOGSAccountCode: "500"
          },
          salesDetails: {
            unitPrice: 520.9900,
            taxType: "NONE",
            accountCode: "400",
          },
          inventoryAssetAccountCode: "630"
        };
        const itemCreateResponse = await xero.accountingApi.createItem(req.session.activeTenant, item);
        const itemId = itemCreateResponse.body.items[0].itemID;

        // GET ONE
        const itemGetResponse = await xero.accountingApi.getItem(req.session.activeTenant, itemId);

        // UPDATE
        const itemUpdate: Item = { code: "Foo" + Helper.getRandomNumber(), name: "Bar - updated", inventoryAssetAccountCode: '630' };
        const items: Items = { items:[itemUpdate] };
        const itemUpdateResponse = await xero.accountingApi.updateItem(req.session.activeTenant, itemId, items);

        // DELETE
        const itemDeleteResponse = await xero.accountingApi.deleteItem(req.session.activeTenant, itemId);
        
        console.log(itemDeleteResponse);
        res.render("items", {
          consentUrl: await xero.buildConsentUrl(),
          authenticated: this.authenticationData(req, res),
          itemsCount: itemsGetResponse.body.items.length,
          createName: itemCreateResponse.body.items[0].name,
          getOneName: itemGetResponse.body.items[0].name,
          updateName: itemUpdateResponse.body.items[0].name,
          deleteResponse: itemDeleteResponse.response.statusCode
        });
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
        const apiResponse = await xero.accountingApi.getJournals(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("journals", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.journals.length
        });
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
        const apiResponse = await xero.accountingApi.getManualJournals(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("manualjournals", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.manualJournals.length
        });
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
        const apiResponse = await xero.accountingApi.getOrganisations(req.session.activeTenant);
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
        const apiResponse = await xero.accountingApi.getOverpayments(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("overpayments", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.overpayments.length
        });
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
        const apiResponse = await xero.accountingApi.getPayments(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("payments", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.payments.length
        });
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
        const apiResponse = await xero.accountingApi.getPaymentServices(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("paymentservices", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.paymentServices.length
        });
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
        const apiResponse = await xero.accountingApi.getPrepayments(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("prepayments", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.prepayments.length
        });
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
        const apiResponse = await xero.accountingApi.getPurchaseOrders(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("purchaseorders", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.purchaseOrders.length
        });
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
        const apiResponse = await xero.accountingApi.getReceipts(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("receipts", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.receipts.length
        });
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
        // let apiResponse = await xero.accountingApi.getReports(req.session.activeTenant);
        res.render("reports", {
          authenticated: this.authenticationData(req, res),
          count: 0
        });
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
        const apiResponse = await xero.accountingApi.getTaxRates(req.session.activeTenant);
        console.log(apiResponse.body);

        res.render("taxrates", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.taxRates.length
        });
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
        const apiResponse = await xero.accountingApi.getTrackingCategories(req.session.activeTenant);
        res.render("trackingcategories", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.trackingCategories.length
        });
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
        const apiResponse = await xero.accountingApi.getUsers(req.session.activeTenant);
        res.render("users", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse.body.users.length
        });
     } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/feedconnections", async (req: Request, res: Response) => {
      try {
        const accessToken =  req.session.accessToken;
        await  xero_bankfeeds.setTokenSet(accessToken);

        // CREATE
        const feedConnection: FeedConnection = new FeedConnection();
        feedConnection.accountName = "My New Account"  + Helper.getRandomNumber();
        feedConnection.accountNumber = "123"  + Helper.getRandomNumber();
        feedConnection.accountToken = "foobar"  + Helper.getRandomNumber();
        feedConnection.accountType = FeedConnection.AccountTypeEnum.BANK;
        feedConnection.currency = CurrencyCode.GBP;

        const feedConnections: FeedConnections = new FeedConnections();
        feedConnections.items = [feedConnection];
         const createResponse = await xero_bankfeeds.bankFeedsApi.createFeedConnections(req.session.activeTenant, feedConnections);
      
         // GET ALL
        const readAllResponse = await xero_bankfeeds.bankFeedsApi.getFeedConnections(req.session.activeTenant);
      
        // GET ONE
        const feedConnectionId = readAllResponse.body.items[0].id;
        const readOneResponse = await xero_bankfeeds.bankFeedsApi.getFeedConnection(req.session.activeTenant, feedConnectionId);
      
        // DELETE
        const deleteConnection: FeedConnection = new FeedConnection();
        deleteConnection.id = feedConnectionId;
        const deleteConnections: FeedConnections = new FeedConnections();
        deleteConnections.items = [deleteConnection];
        const deleteResponse = await xero_bankfeeds.bankFeedsApi.deleteFeedConnections(req.session.activeTenant,deleteConnections);
     
        res.render("feedconnections", {
          authenticated: this.authenticationData(req, res),
          count: readAllResponse.body.items.length,
          createName: createResponse.body.items[0].accountToken,
          getOneName: readOneResponse.body.accountName,
          deleteId: deleteResponse.body.items[0].id
        });

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

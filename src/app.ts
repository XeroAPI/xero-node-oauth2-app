require("dotenv").config();
import * as bodyParser from "body-parser";
import express from "express";
import { Request, Response } from "express";
import * as fs from "fs";
import { Account, Accounts, AccountType, BankTransaction, BankTransactions, BankTransfer, BankTransfers, Contact, Contacts, Item, Invoice, Items, LineItem, LineAmountTypes, Payment, XeroClient, BatchPayment, BatchPayments, TaxType, ContactGroup, ContactGroups, Invoices } from "xero-node";
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
// if you are approved to use the bankfeeds API than the 'bankfeeds' scope is required
// https://developer.xero.com/documentation/bank-feeds-api/overview

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

if (!client_id || !client_secret || !redirectUrl) { 
  throw Error('Environment Variables not all set - please check your .env file in the project root or create one!')
}

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
    // TODO - show loop / get + map each org_name to org_id
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

    router.get("/logout", async (req: Request, res: Response) => {
      try {
        const consentUrl = await xero.buildConsentUrl();
        
        req.session.decodedAccessToken = null
        req.session.accessToken = null
        req.session.allTenants = null
        req.session.activeTenant = null

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
        const url = process.env.REDIRECT_URI + req.originalUrl;
        await xero.setAccessTokenFromRedirectUri(url);
        const accessToken = await xero.readTokenSet();

        const decodedIdToken: XeroJwt = jwtDecode(accessToken.id_token);
        const decodedAccessToken: XeroAccessToken = jwtDecode(accessToken.access_token)
        
        req.session.decodedIdToken = decodedIdToken
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
        const account: Account = { name: "Foo" + Helper.getRandomNumber(10000), code: "" + Helper.getRandomNumber(10000), type: AccountType.EXPENSE };
        const accountCreateResponse = await xero.accountingApi.createAccount(req.session.activeTenant, account);
        const accountId = accountCreateResponse.body.accounts[0].accountID;

        // GET ONE
        const accountGetResponse = await xero.accountingApi.getAccount(req.session.activeTenant, accountId);

        // UPDATE
        const accountUp: Account = { name: "Bar" + Helper.getRandomNumber(10000) };
        const accounts: Accounts = { accounts:[accountUp] };
        const accountUpdateResponse = await xero.accountingApi.updateAccount(req.session.activeTenant, accountId,accounts);

        // Attachments need to be uploaded to associated objects https://developer.xero.com/documentation/api/attachments
        // CREATE ATTACHMENT
        const filename = "xero-dev.jpg";
        const pathToUpload = path.resolve(__dirname, "../public/images/xero-dev.jpg");
        const readStream = fs.createReadStream(pathToUpload);
        const contentType = mime.lookup(filename);

        const accountAttachmentsResponse = await xero.accountingApi.createAccountAttachmentByFileName(req.session.activeTenant,  accountId, filename, readStream, {
          headers: {
            "Content-Type": contentType,
          },
        });

        const attachmentId = accountAttachmentsResponse.body.attachments[0].attachmentID;
        const attachmentMimeType = accountAttachmentsResponse.body.attachments[0].mimeType;
        const attachmentFileName = accountAttachmentsResponse.body.attachments[0].fileName;

        // GET ATTACHMENTS
        const accountAttachmentsGetResponse = await xero.accountingApi.getAccountAttachments(req.session.activeTenant, accountId);

        // GET ATTACHMENT BY ID
        const accountAttachmentsGetByIdResponse = await xero.accountingApi.getAccountAttachmentById(req.session.activeTenant, accountId, attachmentId, attachmentMimeType);
        fs.writeFile(`id-${attachmentFileName}`, accountAttachmentsGetByIdResponse.body, (err) => {
          if (err) { throw err; }
          console.log("file written successfully");
        });

        // GET ATTACHMENT BY FILENAME
        const accountAttachmentsGetByFilenameResponse = await xero.accountingApi.getAccountAttachmentByFileName(req.session.activeTenant, accountId, attachmentFileName, attachmentMimeType);
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
         
        // FIRST we need two Accounts type=BANK
        const account1: Account = {
          name: "Ima Bank: " + Helper.getRandomNumber(10000),
          code: "" + Helper.getRandomNumber(10000),
          type: AccountType.BANK,
          bankAccountNumber: Helper.getRandomNumber(209087654321050).toString()
        };
        const account2: Account = {
          name: "Ima Bank: " + Helper.getRandomNumber(10000),
          code: "" + Helper.getRandomNumber(10000),
          type: AccountType.BANK,
          bankAccountNumber: Helper.getRandomNumber(209087654321051).toString(),
        };
        const created1 = await xero.accountingApi.createAccount(req.session.activeTenant, account1);
        const created2 = await xero.accountingApi.createAccount(req.session.activeTenant, account2);
        const acc1 = created1.body.accounts[0]
        const acc2 = created2.body.accounts[0]

        // CREATE
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
        
        // create a contact to attach to invoice
        const contact: Contact = { name: "Contact Foo Bar" + Helper.getRandomNumber(10000), firstName: "Foo", lastName: "Bar", emailAddress: "foo.bar@example.com" };
        const contactCreateResponse = await xero.accountingApi.createContact(req.session.activeTenant, contact);
        const contactId = contactCreateResponse.body.contacts[0].contactID;

        // Then create an approved/authorised invoice
        const invoiceParams: Invoice = {
          type: Invoice.TypeEnum.ACCREC,
          contact: { 
            contactID: contactId,
          },
          date: "2009-05-27T00:00:00",
          dueDate: "2009-06-06T00:00:00",
          lineAmountTypes: LineAmountTypes.Exclusive,
          lineItems: [
            {
              description: "Consulting services",
              taxType: "NONE",
              quantity: 20,
              unitAmount: 100.00,
              accountCode: "500"
            }
          ],
          status: Invoice.StatusEnum.AUTHORISED
        }
        const createdInvoice = await xero.accountingApi.createInvoice(req.session.activeTenant, invoiceParams)
        const invoice = createdInvoice.body.invoices[0]

        // CREATE
        const payment1: Payment = {
          account: { code: "001" },
          date: "2019-12-31",
          amount: 500,
          invoice
        }
        const payment2: Payment = {
          account: { "code": "001" },
          date: "2019-12-31",
          amount: 500,
          invoice
        }

        const payments: BatchPayment = {
          date: "2018-08-01",
          payments: [
            payment1,
            payment2
          ]
        }
        const batchPayments: BatchPayments = {
          batchPayments: [
            payments
          ]
        }
        const createBatchPayment = await xero.accountingApi.createBatchPayment(req.session.activeTenant, batchPayments);
    
        // GET
        const apiResponse = await xero.accountingApi.getBatchPayments(req.session.activeTenant);


        res.render("batchpayments", {
          authenticated: this.authenticationData(req, res),
          createBatchPayment: createBatchPayment.body.batchPayments,
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

        res.render("brandingthemes", {
          authenticated: this.authenticationData(req, res),
          brandingThemes: apiResponse.body.brandingThemes
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
        const contact: any = { id: "84343da8-d908-4ddd-9f6f-9af6c72ebc4c", name: "Contact Foo Bar" + Helper.getRandomNumber(10000), firstName: "Foo", lastName: "Bar", emailAddress: "foo.bar@example.com" };
        console.log('contact: ',contact)
        const contactCreateResponse = await xero.accountingApi.createContact(req.session.activeTenant, contact);
        const contactId = contactCreateResponse.body.contacts[0].contactID;

        // GET ONE
        const contactGetResponse = await xero.accountingApi.getContact(req.session.activeTenant, contactId);

        // UPDATE
        const contactUpdate: Contact = { name: "Contact Foo Bar" + Helper.getRandomNumber(10000) };
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
        
        // CREATE
        const contactGroupParams: ContactGroups = {contactGroups: [{ name: 'Ima Contact Group' + Helper.getRandomNumber(10000)}] }
        const createContactGroup = await xero.accountingApi.createContactGroup(req.session.activeTenant, contactGroupParams);
        const contactGroup = createContactGroup.body.contactGroups[0]

        // GET
        const getContactGroup = await xero.accountingApi.getContactGroup(req.session.activeTenant, contactGroup.contactGroupID)
        
        // UPDATE
        const num = Helper.getRandomNumber(10000)
        const contact: Contact = { name: "Contact Foo Bar" + num, firstName: "Foo", lastName: "Bar", emailAddress: `foo+${num}@example.com` };
        const contactCreateResponse = await xero.accountingApi.createContact(req.session.activeTenant, contact);
        const createdContact = contactCreateResponse.body.contacts[0];
        const updatedContactGroupParams: Contacts = {
          contacts: [{ contactID: createdContact.contactID }]
        }
        // To create contacts w/in contact group you cannot pass a whole Contact
        // need to pass it as an aray of with the following key `{ contacts: [{ contactID: createdContact.contactID }] }`
        const updatedContactGroup = await xero.accountingApi.createContactGroupContacts(req.session.activeTenant, contactGroup.contactGroupID, updatedContactGroupParams)
        
        // DELETE
        const deletedContactGroupContact = await xero.accountingApi.deleteContactGroupContact(req.session.activeTenant, contactGroup.contactGroupID, createdContact.contactID)
        const deleted = deletedContactGroupContact.response.statusCode === 204 

        // GET ALL
        const allContactGroups = await xero.accountingApi.getContactGroups(req.session.activeTenant);

        res.render("contactgroups", {
          authenticated: this.authenticationData(req, res),
          createdContactGroupID: contactGroup.contactGroupID,
          getContactGroupName: getContactGroup.body.contactGroups[0].name,
          updatedContactGroupContactID: updatedContactGroup.body.contacts[0].contactID,
          deletedContactGroupContact: deleted ? `${createdContact.contactID} removed from contact group` : 'failed to delete',
          count: allContactGroups.body.contactGroups.length
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
          currencies: apiResponse.body.currencies
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
        
        const contactsResponse = await xero.accountingApi.getContacts(req.session.activeTenant);
        const brandingTheme = await xero.accountingApi.getBrandingThemes(req.session.activeTenant);

        const invoiceParams: Invoice = {
          type: Invoice.TypeEnum.ACCREC,
          contact: {
            contactID: contactsResponse.body.contacts[0].contactID
          },
          expectedPaymentDate: "2009-10-20T00:00:00",
          invoiceNumber: `XERO:${Helper.getRandomNumber(10000)}`,
          reference: `REF:${Helper.getRandomNumber(10000)}`,
          brandingThemeID: brandingTheme.body.brandingThemes[0].brandingThemeID,
          url: "https://deeplink-to-your-site.com",
          currencyCode: CurrencyCode.USD,
          status: Invoice.StatusEnum.SUBMITTED,
          lineAmountTypes: LineAmountTypes.Inclusive,
          subTotal: 87.11,
          totalTax: 10.89,
          total: 98.00,
          date: "2009-05-27T00:00:00",
          dueDate: "2009-06-06T00:00:00",
          lineItems: [
            {
              description: "Consulting services",
              taxType: "NONE",
              quantity: 20,
              unitAmount: 100.00,
              accountCode: "500"
            },
            {
              description: "Mega Consulting services",
              taxType: "NONE",
              quantity: 10,
              unitAmount: 500.00,
              accountCode: "500"
            }
          ]
        }
        
        const createdInvoice = await xero.accountingApi.createInvoice(req.session.activeTenant, invoiceParams)

        // GET ONE
        const getInvoice = await xero.accountingApi.getInvoice(req.session.activeTenant, createdInvoice.body.invoices[0].invoiceID)
        const invoiceId = getInvoice.body.invoices[0].invoiceID

        // UPDATE
        const newReference = {reference: `NEW-REF:${Helper.getRandomNumber(10000)}`}

        const invoiceToUpdate: Invoices = {
          invoices: [            
            Object.assign(invoiceParams, newReference)
          ]
        }

        const updatedInvoices = await xero.accountingApi.updateInvoice(req.session.activeTenant, invoiceId, invoiceToUpdate)

        // GET ALL
        const totalInvoices = await xero.accountingApi.getInvoices(req.session.activeTenant);

        res.render("invoices", {
          authenticated: this.authenticationData(req, res),
          invoiceId,
          createdInvoice: createdInvoice.body.invoices[0],
          updatedInvoice: updatedInvoices.body.invoices[0],
          count: totalInvoices.body.invoices.length
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
          code: "Foo" + Helper.getRandomNumber(10000),
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
        const itemUpdate: Item = { code: "Foo" + Helper.getRandomNumber(10000), name: "Bar - updated", inventoryAssetAccountCode: '630' };
        const items: Items = { items:[itemUpdate] };
        const itemUpdateResponse = await xero.accountingApi.updateItem(req.session.activeTenant, itemId, items);

        // DELETE
        const itemDeleteResponse = await xero.accountingApi.deleteItem(req.session.activeTenant, itemId);

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
        feedConnection.accountName = "My New Account"  + Helper.getRandomNumber(10000);
        feedConnection.accountNumber = "123"  + Helper.getRandomNumber(10000);
        feedConnection.accountToken = "foobar"  + Helper.getRandomNumber(10000);
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

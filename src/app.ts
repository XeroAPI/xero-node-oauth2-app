require("dotenv").config();
import * as bodyParser from "body-parser";
import express from "express";
import { Request, Response } from "express";
import * as fs from "fs";
import { Account, Accounts, AccountType, BankTransaction, BankTransactions, BankTransfer, BankTransfers, Contact, Contacts, Item, Invoice, Items, LineItem, LineAmountTypes, Payment, XeroClient, BatchPayment, BatchPayments, TaxType, ContactGroup, ContactGroups, Invoices, ContactPerson, Quote, Quotes, TaxRate, TaxRates, TrackingCategory, TrackingCategories, TrackingOption, CurrencyCode } from "xero-node";
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

if (!client_id || !client_secret || !redirectUrl) {
  throw Error('Environment Variables not all set - please check your .env file in the project root or create one!')
}

class App {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.config();
    this.routes();
    this.app.set("views", path.join(__dirname, "views"));
    this.app.set("view engine", "ejs");
    this.app.use(express.static(path.join(__dirname, "public")));
  }

  private config(): void {
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
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
        const authData = this.authenticationData(req, res)
        res.render("home", {
          consentUrl: authData.decodedAccessToken ? undefined : await xero.buildConsentUrl(),
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
          consentUrl: authData.decodedAccessToken ? undefined : await xero.buildConsentUrl(),
          authenticated: this.authenticationData(req, res)
        });
      } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/refresh-token", async (req: Request, res: Response) => {
      try {

        // Refresh Token
        await xero.refreshToken()
        const newAccessToken = await xero.readTokenSet();

        const decodedIdToken: XeroJwt = jwtDecode(newAccessToken.id_token);
        const decodedAccessToken: XeroAccessToken = jwtDecode(newAccessToken.access_token)

        req.session.decodedIdToken = decodedIdToken
        req.session.decodedAccessToken = decodedAccessToken
        req.session.accessToken = newAccessToken;

        const authData = this.authenticationData(req, res)

        res.render("home", {
          consentUrl: authData.decodedAccessToken ? undefined : await xero.buildConsentUrl(),
          authenticated: this.authenticationData(req, res)
        });
      } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/logout", async (req: Request, res: Response) => {
      try {
        req.session.decodedAccessToken = null
        req.session.accessToken = null
        req.session.allTenants = null
        req.session.activeTenant = null

        const authData = this.authenticationData(req, res)

        res.render("home", {
          consentUrl: authData.decodedAccessToken ? undefined : await xero.buildConsentUrl(),
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
          consentUrl: authData.decodedAccessToken ? undefined : await xero.buildConsentUrl(),
          authenticated: this.authenticationData(req, res)
        });
      } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/accounts", async (req: Request, res: Response) => {
      try {
        const accessToken = req.session.accessToken;
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
        const accounts: Accounts = { accounts: [accountUp] };
        const accountUpdateResponse = await xero.accountingApi.updateAccount(req.session.activeTenant, accountId, accounts);

        // Attachments need to be uploaded to associated objects https://developer.xero.com/documentation/api/attachments
        // CREATE ATTACHMENT
        const filename = "xero-dev.jpg";
        const pathToUpload = path.resolve(__dirname, "../public/images/xero-dev.jpg");
        const readStream = fs.createReadStream(pathToUpload);
        const contentType = mime.lookup(filename);

        const accountAttachmentsResponse = await xero.accountingApi.createAccountAttachmentByFileName(req.session.activeTenant, accountId, filename, readStream, {
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

        // CREATE ONE OR MORE BANK TRANSACTION
        const contactsResponse = await xero.accountingApi.getContacts(req.session.activeTenant);
        const useContact: Contact = { contactID: contactsResponse.body.contacts[0].contactID };

        const allAccounts = await xero.accountingApi.getAccounts(req.session.activeTenant);
        const validAccountCode = allAccounts.body.accounts.filter(e => !['NONE', 'BASEXCLUDED'].includes(e.taxType))[0].code

        const lineItems: LineItem[] = [{
          description: "consulting",
          quantity: 1.0,
          unitAmount: 20.0,
          accountCode: validAccountCode,
        }];
        const where = 'Status=="' + Account.StatusEnum.ACTIVE + '" AND Type=="' + Account.BankAccountTypeEnum.BANK + '"';
        const accountsResponse = await xero.accountingApi.getAccounts(req.session.activeTenant, null, where);
        const useBankAccount: Account = { accountID: accountsResponse.body.accounts[0].accountID };

        const newBankTransaction: BankTransaction = {
          type: BankTransaction.TypeEnum.SPEND,
          contact: useContact,
          lineItems,
          bankAccount: useBankAccount,
          date: "2019-09-19T00:00:00",
        };

        // Add bank transaction objects to array
        const newBankTransactions: BankTransactions = new BankTransactions();
        newBankTransactions.bankTransactions = [newBankTransaction, newBankTransaction];
        const bankTransactionCreateResponse = await xero.accountingApi.createBankTransactions(req.session.activeTenant, newBankTransactions, false);

        // UPDATE OR CREATE ONE OR MORE BANK TRANSACTION
        const newBankTransaction2: BankTransaction = {
          type: BankTransaction.TypeEnum.SPEND,
          contact: useContact,
          lineItems,
          bankAccount: useBankAccount,
          date: "2019-09-19T00:00:00",
        };

        // Swap in this lineItem arry to force an ERROR with an invalid account code
        const lineItems2: LineItem[] = [{
          description: "consulting",
          quantity: 1.0,
          unitAmount: 20.0,
          accountCode: "6666666666",
        }];

        const newBankTransaction3: BankTransaction = {
          bankTransactionID: bankTransactionCreateResponse.body.bankTransactions[0].bankTransactionID,
          type: BankTransaction.TypeEnum.SPEND,
          contact: useContact,
          bankAccount: useBankAccount,
          reference: "Changed",
          lineItems: lineItems
        };

        const upBankTransactions: BankTransactions = new BankTransactions();
        upBankTransactions.bankTransactions = [newBankTransaction2, newBankTransaction3];
        const bankTransactionUpdateOrCreateResponse = await xero.accountingApi.updateOrCreateBankTransactions(req.session.activeTenant, upBankTransactions, false);

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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);

        const allContacts = await xero.accountingApi.getContacts(req.session.activeTenant)
        // Then create an approved/authorised invoice
        const invoice1: Invoice = {
          type: Invoice.TypeEnum.ACCREC,
          contact: {
            contactID: allContacts.body.contacts[0].contactID
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

        const newInvoices: Invoices = new Invoices();
        newInvoices.invoices = [invoice1];

        const createdInvoice = await xero.accountingApi.createInvoices(req.session.activeTenant, newInvoices)
        const invoice = createdInvoice.body.invoices[0]

        const accountsGetResponse = await xero.accountingApi.getAccounts(req.session.activeTenant);

        // CREATE
        const payment1: any = { // Payment
          account: { code: "001" },
          date: "2019-12-31",
          amount: 500,
          invoice: {
            invoiceID: invoice.invoiceID // Not typed correctly
          }
        }

        // BatchPayment 'reference'?: string; is not optional
        // "ValidationErrors": [
        // "Message": "Batch deposits require a reference"
        const payments: BatchPayment = {
          account: {
            accountID: accountsGetResponse.body.accounts[0].accountID
          },
          reference: "ref",
          date: "2018-08-01",
          payments: [
            payment1
          ]
        }

        const batchPayments: BatchPayments = { // BatchPayments - the account is not typed correctly in ts BatchPayment to accept an accountID
          batchPayments: [
            payments
          ]
        }

        const createBatchPayment = await xero.accountingApi.createBatchPayment(req.session.activeTenant, batchPayments);

        // GET
        const apiResponse = await xero.accountingApi.getBatchPayments(req.session.activeTenant);

        res.render("batchpayments", {
          authenticated: this.authenticationData(req, res),
          createBatchPayment: createBatchPayment.body.batchPayments[0].batchPaymentID,
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);

        // GET ALL
        const contactsGetResponse = await xero.accountingApi.getContacts(req.session.activeTenant);

        // CREATE ONE OR MORE
        const contact1: Contact = { name: "Rick James: " + Helper.getRandomNumber(10000), firstName: "Rick", lastName: "James", emailAddress: "test@example.com" };
        const newContacts: Contacts = new Contacts();
        newContacts.contacts = [contact1];
        const contactCreateResponse = await xero.accountingApi.createContacts(req.session.activeTenant, newContacts);
        const contactId = contactCreateResponse.body.contacts[0].contactID;

        // UPDATE or CREATE BATCH - force validation error
        const person: ContactPerson = {
          firstName: 'Joe',
          lastName: 'Schmo'
        }

        const updateContacts: Contacts = new Contacts();
        const contact2: Contact = {
          contactID: contactId,
          name: "Rick James: " + Helper.getRandomNumber(10000),
          firstName: "Rick",
          lastName: "James",
          emailAddress: "test@example.com",
          contactPersons: [person]
        };
        const contact3: Contact = { name: "Rick James: " + Helper.getRandomNumber(10000), firstName: "Rick", lastName: "James", emailAddress: "test@example.com" };

        updateContacts.contacts = [contact2, contact3];
        await xero.accountingApi.updateOrCreateContacts(req.session.activeTenant, updateContacts, false);

        // GET ONE
        const contactGetResponse = await xero.accountingApi.getContact(req.session.activeTenant, contactId);

        // UPDATE SINGLE
        const contactUpdate: Contact = { name: "Rick James Updated: " + Helper.getRandomNumber(10000) };
        const contacts: Contacts = { contacts: [contactUpdate] };
        const contactUpdateResponse = await xero.accountingApi.updateContact(req.session.activeTenant, contactId, contacts);

        res.render("contacts", {
          consentUrl: await xero.buildConsentUrl(),
          authenticated: this.authenticationData(req, res),
          contactsCount: contactsGetResponse.body.contacts.length,
          createName: contactCreateResponse.body.contacts[0].name,
          getOneName: contactGetResponse.body.contacts[0].name,
          updatedContact: contactUpdateResponse.body.contacts[0],
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
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);

        // CREATE
        const contactGroupParams: ContactGroups = { contactGroups: [{ name: 'Ima Contact Group' + Helper.getRandomNumber(10000) }] }
        const createContactGroup = await xero.accountingApi.createContactGroup(req.session.activeTenant, contactGroupParams);
        const contactGroup = createContactGroup.body.contactGroups[0]

        // GET
        const getContactGroup = await xero.accountingApi.getContactGroup(req.session.activeTenant, contactGroup.contactGroupID)

        // UPDATE
        const num = Helper.getRandomNumber(10000)
        const contact1: Contact = { name: "Rick James: " + num, firstName: "Rick", lastName: "James", emailAddress: `foo+${num}@example.com` };
        const newContacts: Contacts = new Contacts();
        newContacts.contacts = [contact1];
        const contactCreateResponse = await xero.accountingApi.createContacts(req.session.activeTenant, newContacts);
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);

        const brandingTheme = await xero.accountingApi.getBrandingThemes(req.session.activeTenant);

        const num = Helper.getRandomNumber(10000)
        const contact1: Contact = { name: "Test User: " + num, firstName: "Rick", lastName: "James", emailAddress: req.session.decodedIdToken.email };
        const newContacts: Contacts = new Contacts();
        newContacts.contacts = [contact1];
        await xero.accountingApi.createContacts(req.session.activeTenant, newContacts);

        const contactsResponse = await xero.accountingApi.getContacts(req.session.activeTenant);
        const selfContact = contactsResponse.body.contacts.filter(contact => contact.emailAddress === req.session.decodedIdToken.email);

        const invoice1: Invoice = {
          type: Invoice.TypeEnum.ACCREC,
          contact: {
            contactID: selfContact[0].contactID
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

        // Array of Invoices needed
        const newInvoices: Invoices = new Invoices()
        newInvoices.invoices = [invoice1, invoice1];

        // CREATE ONE OR MORE INVOICES
        const createdInvoice = await xero.accountingApi.createInvoices(req.session.activeTenant, newInvoices, false)
        console.log(createdInvoice.response.statusCode);

        // Since we are using summarizeErrors = false we get 200 OK statuscode
        // Our array of created invoices include those that succeeded and those with validation errors.
        // loop over the invoices and if it has an error, loop over the error messages
        for (let i = 0; i < createdInvoice.body.invoices.length; i++) {
          if (createdInvoice.body.invoices[i].hasErrors) {
            let errors = createdInvoice.body.invoices[i].validationErrors;
            for (let j = 0; j < errors.length; j++) {
              console.log(errors[j].message);
            }
          }
        }

        // CREATE ONE OR MORE INVOICES - FORCE Validation error with bad account code
        const updateInvoices: Invoices = new Invoices();
        const invoice2: Invoice = {
          type: Invoice.TypeEnum.ACCREC,
          contact: {
            contactID: selfContact[0].contactID
          },
          status: Invoice.StatusEnum.SUBMITTED,
          date: "2009-05-27T00:00:00",
          dueDate: "2009-06-06T00:00:00",
          lineItems: [
            {
              description: "Consulting services",
              taxType: "NONE",
              quantity: 20,
              unitAmount: 100.00,
              accountCode: "99999999"
            }
          ]
        }
        updateInvoices.invoices = [invoice1, invoice2];
        await xero.accountingApi.updateOrCreateInvoices(req.session.activeTenant, updateInvoices, false)

        // GET ONE
        const getInvoice = await xero.accountingApi.getInvoice(req.session.activeTenant, createdInvoice.body.invoices[0].invoiceID)
        const invoiceId = getInvoice.body.invoices[0].invoiceID

        // UPDATE
        const newReference = { reference: `NEW-REF:${Helper.getRandomNumber(10000)}` }

        const invoiceToUpdate: Invoices = {
          invoices: [
            Object.assign(invoice1, newReference)
          ]
        }

        const updatedInvoices = await xero.accountingApi.updateInvoice(req.session.activeTenant, invoiceId, invoiceToUpdate)

        // GET ALL
        const totalInvoices = await xero.accountingApi.getInvoices(req.session.activeTenant);

        res.render("invoices", {
          authenticated: this.authenticationData(req, res),
          invoiceId,
          email: req.session.decodedIdToken.email,
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

    router.get("/email-invoice", async (req: Request, res: Response) => {
      try {
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);

        const invoiceID = req.query.invoiceID
        // SEND Email
        const apiResponse = await xero.accountingApi.emailInvoice(req.session.activeTenant, invoiceID, {})

        res.render("invoices", {
          authenticated: this.authenticationData(req, res),
          count: apiResponse
        });
      } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/invoices-filtered", async (req: Request, res: Response) => {
      try {
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);

        // invoices
        // contacts
        // credit notes

        // const apiResponse = await xero.accountingApi.getInvoices(
        //   // expected params & types
        //   xeroTenantId: req.session.activeTenant,
        //   ifModifiedSince?: Date,
        //   where?: string,
        //   order?: string,
        //   iDs?: Array<string>,
        //   invoiceNumbers?: Array<string>,
        //   contactIDs?: Array<string>,
        //   statuses?: Array<string>,
        //   page?: number,
        //   includeArchived?: boolean,
        //   createdByMyApp?: boolean,
        //   unitdp?: number,
        //   options: {
        //     ...
        //   }
        // )
        const filteredInvoices = await xero.accountingApi.getInvoices(
            req.session.activeTenant,
            new Date(2018),
            'Type=="ACCREC"',
            undefined,
            undefined,
            undefined,
            undefined,
            ['PAID', 'DRAFT'],
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
          )
        res.render("invoices-filtered", {
          authenticated: this.authenticationData(req, res),
          filteredInvoices: filteredInvoices.body.invoices
        });
      } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/attach-pdf-invoice", async (req: Request, res: Response) => {
      try {
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);

        const totalInvoices = await xero.accountingApi.getInvoices(req.session.activeTenant);
        
        // Attachments need to be uploaded to associated objects https://developer.xero.com/documentation/api/attachments
        // CREATE ATTACHMENT
        const filename = "xero-dev.jpg";
        const pathToUpload = path.resolve(__dirname, "../public/images/xero-dev.jpg");
        const readStream = fs.createReadStream(pathToUpload);
        const contentType = mime.lookup(filename);

        const filteredInvoices = await xero.accountingApi.createInvoiceAttachmentByFileName(req.session.activeTenant, totalInvoices.body.invoices[0].invoiceID, filename, readStream, {
          headers: {
            "Content-Type": contentType,
          },
        });

        res.render("invoices-filtered", {
          authenticated: this.authenticationData(req, res),
          filteredInvoices: filteredInvoices.body
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
      // currently works with DEMO COMPANY specific data.. Will need to create proper accounts
      // w/ cOGS codes to have this work with an empty Xero Org
      try {
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);

        // GET ALL
        const itemsGetResponse = await xero.accountingApi.getItems(req.session.activeTenant);

        // CREATE ONE or MORE ITEMS
        const item1: Item = {
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
        const newItems: Items = new Items();
        newItems.items = [item1]

        const itemCreateResponse = await xero.accountingApi.createItems(req.session.activeTenant, newItems);
        const itemId = itemCreateResponse.body.items[0].itemID;

        // UPDATE OR CREATE ONE or MORE ITEMS - FORCE validation error on update
        item1.name = "Bar" + Helper.getRandomNumber(10000)
        const updateItems: Items = new Items();
        updateItems.items = [item1]

        await xero.accountingApi.updateOrCreateItems(req.session.activeTenant, updateItems, false);

        // GET ONE
        const itemGetResponse = await xero.accountingApi.getItem(req.session.activeTenant, itemsGetResponse.body.items[0].itemID)

        // UPDATE
        const itemUpdate: Item = { code: "Foo" + Helper.getRandomNumber(10000), name: "Bar - updated", inventoryAssetAccountCode: item1.inventoryAssetAccountCode };
        const items: Items = { items: [itemUpdate] };
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const apiResponse = await xero.accountingApi.getOrganisations(req.session.activeTenant);
        // CREATE
        // GET ONE
        // UPDATE
        res.render("organisations", {
          authenticated: this.authenticationData(req, res),
          orgs: apiResponse.body.organisations
        });
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
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
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET BANK SUMMARY REPORT
        const fromDate = "2019-01-01";
        const toDate = "2019-12-31";
        const apiResponse = await xero.accountingApi.getReportBankSummary(req.session.activeTenant, fromDate, toDate);
        console.log(apiResponse.body.reports[0].reportTitles[2]);
        // CREATE
        // GET ONE
        // UPDATE
        // We need specific report API calls
        // let apiResponse = await xero.accountingApi.getReports(req.session.activeTenant);
        res.render("reports", {
          consentUrl: await xero.buildConsentUrl(),
          authenticated: this.authenticationData(req, res),
          count: 0,
          bankSummaryTitle: apiResponse.body.reports[0].reportTitles[2]
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
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const getAllResponse = await xero.accountingApi.getTaxRates(req.session.activeTenant);
        console.log(getAllResponse.body);

        const newTaxRate: TaxRate = {
          name: `Tax Rate Name ${Helper.getRandomNumber(10000)}`,
          reportTaxType: undefined,
          taxComponents: [
            {
              name: "State Tax",
              rate: 7.5,
              isCompound: false,
              isNonRecoverable: false
            },
            {
              name: "Local Sales Tax",
              rate: 0.625,
              isCompound: false,
              isNonRecoverable: false
            }
          ]
        };

        const taxRates: TaxRates = new TaxRates();
        taxRates.taxRates = [newTaxRate];

        // CREATE
        const createResponse = await xero.accountingApi.createTaxRates(req.session.activeTenant, taxRates);
        console.log(createResponse.body);

        const updatedTaxRate: TaxRate = newTaxRate;

        updatedTaxRate.status = TaxRate.StatusEnum.DELETED;

        taxRates.taxRates = [updatedTaxRate];

        // UPDATE
        const updateResponse = await xero.accountingApi.updateTaxRate(req.session.activeTenant, taxRates);
        console.log(updateResponse.body);

        res.render("taxrates", {
          authenticated: this.authenticationData(req, res),
          count: getAllResponse.body.taxRates.length,
          created: createResponse.body.taxRates[0].name,
          updated: updateResponse.body.taxRates[0].status
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
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);

        // GET ALL
        const getAllResponse = await xero.accountingApi.getTrackingCategories(req.session.activeTenant);

        // New Tracking Category
        const trackingCategory: TrackingCategory = {
          name: `Tracking Category ${Helper.getRandomNumber(10000)}`,
          status: TrackingCategory.StatusEnum.ACTIVE
        };

        // New Tracking Category Option
        const trackingCategoryOption: TrackingOption = {
          name: `Tracking Option ${Helper.getRandomNumber(10000)}`,
          status: TrackingOption.StatusEnum.ACTIVE
        };

        // CREATE
        const createCategoryResponse = await xero.accountingApi.createTrackingCategory(req.session.activeTenant, trackingCategory);
        await xero.accountingApi.createTrackingOptions(req.session.activeTenant, createCategoryResponse.body.trackingCategories[0].trackingCategoryID, trackingCategoryOption);

        // GET ONE
        const getOneResponse = await xero.accountingApi.getTrackingCategory(req.session.activeTenant, createCategoryResponse.body.trackingCategories[0].trackingCategoryID);

        // UPDATE
        const updateResponse = await xero.accountingApi.updateTrackingCategory(req.session.activeTenant, getOneResponse.body.trackingCategories[0].trackingCategoryID, { name: `${getOneResponse.body.trackingCategories[0].name} - updated` });

        // DELETE
        const deleteResponse = await xero.accountingApi.deleteTrackingCategory(req.session.activeTenant, createCategoryResponse.body.trackingCategories[0].trackingCategoryID);

        res.render("trackingcategories", {
          authenticated: this.authenticationData(req, res),
          count: getAllResponse.body.trackingCategories.length,
          created: createCategoryResponse.body.trackingCategories[0].trackingCategoryID,
          got: getOneResponse.body.trackingCategories[0].name,
          updated: updateResponse.body.trackingCategories[0].name,
          deleted: deleteResponse.body.trackingCategories[0].status
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
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const getAllUsers = await xero.accountingApi.getUsers(req.session.activeTenant);

        // GET ONE USER
        const getUser = await xero.accountingApi.getUser(req.session.activeTenant, getAllUsers.body.users[0].userID);
        res.render("users", {
          authenticated: this.authenticationData(req, res),
          user: getUser.body.users[0].emailAddress,
          count: getAllUsers.body.users.length
        });
      } catch (e) {
        res.status(res.statusCode);
        res.render("shared/error", {
          consentUrl: await xero.buildConsentUrl(),
          error: e
        });
      }
    });

    router.get("/quotes", async (req: Request, res: Response) => {
      try {
        const accessToken = req.session.accessToken;
        await xero.setTokenSet(accessToken);
        // GET ALL
        const getAllQuotes = await xero.accountingApi.getQuotes(req.session.activeTenant)

        // GET ONE
        const getOneQuote = await xero.accountingApi.getQuote(req.session.activeTenant, getAllQuotes.body.quotes[0].quoteID);
        res.render("quotes", {
          authenticated: this.authenticationData(req, res),
          count: getAllQuotes.body.quotes.length,
          getOneQuoteNumber: getOneQuote.body.quotes[0].quoteNumber
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

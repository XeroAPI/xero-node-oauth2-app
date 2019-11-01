"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const xero_node_1 = require("xero-node");
const fs = require("fs");
const helper_1 = require("./helper");
const mustacheExpress = require('mustache-express');
const session = require('express-session');
const path = require("path");
const localVarRequest = require("request");
const mime = require('mime-types');
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirectUrl = process.env.REDIRECT_URI;
const scopes = 'openid profile email accounting.settings accounting.reports.read accounting.journals.read accounting.contacts accounting.attachments accounting.transactions offline_access';
const xero = new xero_node_1.XeroClient({
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
        this.app.engine('html', mustacheExpress());
        this.app.set('view engine', 'html');
        this.app.set('views', path.resolve(__dirname, '..', 'dist', 'views'));
        this.app.use(express.static('public'));
    }
    config() {
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: false }));
    }
    routes() {
        const router = express.Router();
        router.get('/', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let consentUrl = yield xero.buildConsentUrl();
                res.render('index', { url: consentUrl });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/callback', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let url = "http://localhost:5000/" + req.originalUrl;
                yield xero.setAccessTokenFromRedirectUri(url);
                let accessToken = yield xero.readTokenSet();
                req.session.accessToken = accessToken;
                res.render('callback', '');
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/accounts', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let accountsGetResponse = yield xero.accountingApi.getAccounts(xero.tenantIds[0]);
                //CREATE
                let account = { name: "Foo" + helper_1.default.getRandomNumber(), code: "" + helper_1.default.getRandomNumber(), type: xero_node_1.AccountType.EXPENSE };
                let accountCreateResponse = yield xero.accountingApi.createAccount(xero.tenantIds[0], account);
                let accountId = accountCreateResponse.body.accounts[0].accountID;
                //GET ONE
                let accountGetResponse = yield xero.accountingApi.getAccount(xero.tenantIds[0], accountId);
                //UPDATE
                let accountUp = { name: "Bar" + helper_1.default.getRandomNumber() };
                let accounts = { accounts: [accountUp] };
                let accountUpdateResponse = yield xero.accountingApi.updateAccount(xero.tenantIds[0], accountId, accounts);
                // CREATE ATTACHMENT
                const filename = 'xero-dev.jpg';
                const pathToUpload = path.resolve(__dirname, "../public/images/xero-dev.jpg");
                const filesize = fs.statSync(pathToUpload).size;
                const readStream = fs.createReadStream(pathToUpload);
                const contentType = mime.lookup(filename);
                let accountAttachmentsResponse = yield xero.accountingApi.createAccountAttachmentByFileName(xero.tenantIds[0], accountId, filename, readStream, {
                    headers: {
                        'Content-Type': contentType
                    }
                });
                console.log(accountAttachmentsResponse.body);
                //GET ATTACHMENTS
                let accountAttachmentsGetResponse = yield xero.accountingApi.getAccountAttachments(xero.tenantIds[0], accountId);
                let attachmentId = accountAttachmentsResponse.body.attachments[0].attachmentID;
                let attachmentMimeType = accountAttachmentsResponse.body.attachments[0].mimeType;
                let attachmentFileName = accountAttachmentsResponse.body.attachments[0].fileName;
                //GET ATTACHMENT BY ID
                let accountAttachmentsGetByIdResponse = yield xero.accountingApi.getAccountAttachmentById(xero.tenantIds[0], accountId, attachmentId, attachmentMimeType);
                console.log(accountAttachmentsGetByIdResponse.body.length);
                fs.writeFile(`id-${attachmentFileName}`, accountAttachmentsGetByIdResponse.body, err => {
                    if (err)
                        throw err;
                    console.log('file written successfully');
                });
                //GET ATTACHMENT BY FILENAME
                let accountAttachmentsGetByFilenameResponse = yield xero.accountingApi.getAccountAttachmentByFileName(xero.tenantIds[0], accountId, attachmentFileName, attachmentMimeType);
                console.log(accountAttachmentsGetByFilenameResponse.body.length);
                fs.writeFile(`filename-${attachmentFileName}`, accountAttachmentsGetByFilenameResponse.body, err => {
                    if (err)
                        throw err;
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
        }));
        router.get('/banktransactions', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let bankTransactionsGetResponse = yield xero.accountingApi.getBankTransactions(xero.tenantIds[0]);
                //CREATE
                let contactsResponse = yield xero.accountingApi.getContacts(xero.tenantIds[0]);
                let useContact = { contactID: contactsResponse.body.contacts[0].contactID };
                let lineItems = [{
                        description: 'consulting',
                        quantity: 1.0,
                        unitAmount: 20.0,
                        accountCode: '200'
                    }];
                let where = 'Status=="' + xero_node_1.Account.StatusEnum.ACTIVE + '" AND Type=="' + xero_node_1.Account.BankAccountTypeEnum.BANK + '"';
                let accountsResponse = yield xero.accountingApi.getAccounts(xero.tenantIds[0], null, where);
                let useBankAccount = { accountID: accountsResponse.body.accounts[0].accountID };
                let newBankTransaction = {
                    type: xero_node_1.BankTransaction.TypeEnum.SPEND,
                    contact: useContact,
                    lineItems: lineItems,
                    bankAccount: useBankAccount,
                    date: '2019-09-19T00:00:00',
                };
                let bankTransactionCreateResponse = yield xero.accountingApi.createBankTransaction(xero.tenantIds[0], newBankTransaction);
                //GET ONE
                let bankTransactionId = bankTransactionCreateResponse.body.bankTransactions[0].bankTransactionID;
                let bankTransactionGetResponse = yield xero.accountingApi.getBankTransaction(xero.tenantIds[0], bankTransactionId);
                //UPDATE status to deleted
                var bankTransactionUp = Object.assign({}, bankTransactionGetResponse.body.bankTransactions[0]);
                delete bankTransactionUp.updatedDateUTC;
                delete bankTransactionUp.contact; // also has an updatedDateUTC
                bankTransactionUp.status = xero_node_1.BankTransaction.StatusEnum.DELETED;
                let bankTransactions = { bankTransactions: [bankTransactionUp] };
                let bankTransactionUpdateResponse = yield xero.accountingApi.updateBankTransaction(xero.tenantIds[0], bankTransactionId, bankTransactions);
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
        }));
        router.get('/banktranfers', (req, res) => __awaiter(this, void 0, void 0, function* () {
            //FIRST check if two bank accounts exist!!
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getBankTransfers(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('banktranfers', { count: apiResponse.body.bankTransfers.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/batchpayments', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getBatchPayments(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('batchpayments', { count: apiResponse.body.batchPayments.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/brandingthemes', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getBrandingThemes(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('brandingthemes', { count: apiResponse.body.brandingThemes.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/contacts', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getContacts(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('contacts', { count: apiResponse.body.contacts.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/contactgroups', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getContactGroups(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('contactgroups', { count: apiResponse.body.contactGroups.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/creditnotes', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getCreditNotes(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('creditnotes', { count: apiResponse.body.creditNotes.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/currencies', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getCurrencies(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('currencies', { count: apiResponse.body.currencies.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/employees', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getEmployees(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('employees', { count: apiResponse.body.employees.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/expenseclaims', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getExpenseClaims(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('expenseclaims', { count: apiResponse.body.expenseClaims.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/invoicereminders', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getInvoiceReminders(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('invoicereminders', { count: apiResponse.body.invoiceReminders.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/invoices', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getInvoices(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('invoices', { count: apiResponse.body.invoices.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/items', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getItems(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('items', { count: apiResponse.body.items.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/journals', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getJournals(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('journals', { count: apiResponse.body.journals.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/manualjournals', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getManualJournals(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('manualjournals', { count: apiResponse.body.manualJournals.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/organisations', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getOrganisations(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('organisations', { name: apiResponse.body.organisations[0].name });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/overpayments', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getOverpayments(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('overpayments', { count: apiResponse.body.overpayments.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/payments', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getPayments(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('payments', { count: apiResponse.body.payments.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/paymentservices', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getPaymentServices(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('paymentservices', { count: apiResponse.body.paymentServices.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/prepayments', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getPrepayments(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('prepayments', { count: apiResponse.body.prepayments.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/purchaseorders', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getPurchaseOrders(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('purchaseorders', { count: apiResponse.body.purchaseOrders.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/receipts', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getReceipts(xero.tenantIds[0]);
                //CREATE
                //GET ONE
                //UPDATE
                res.render('receipts', { count: apiResponse.body.receipts.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/reports', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                //CREATE
                //GET ONE
                //UPDATE
                //We need specific report API calls
                //let apiResponse = await xero.accountingApi.getReports(xero.tenantIds[0]);
                res.render('reports', { count: 0 });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/taxrates', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getTaxRates(xero.tenantIds[0]);
                res.render('taxrates', { count: apiResponse.body.taxRates.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/trackingcategories', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getTrackingCategories(xero.tenantIds[0]);
                res.render('trackingcategories', { count: apiResponse.body.trackingCategories.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/users', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                //GET ALL
                let apiResponse = yield xero.accountingApi.getUsers(xero.tenantIds[0]);
                res.render('users', { count: apiResponse.body.users.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        this.app.use(session({
            secret: 'something crazy',
            resave: false,
            saveUninitialized: true,
            cookie: { secure: false }
        }));
        this.app.use('/', router);
    }
}
exports.default = new App().app;
//# sourceMappingURL=app.js.map
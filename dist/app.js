"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const bodyParser = require("body-parser");
const xero_node_sdk_1 = require("xero-node-sdk");
const helper_1 = require("./helper");
const mustacheExpress = require('mustache-express');
const session = require('express-session');
const path = require("path");
const localVarRequest = require("request");
// ORANGE
//const client_id = '***REMOVED***'
//const client_secret = '***REMOVED***'
// oauth2 app only
//const client_id = '***REMOVED***'
//const client_secret = '***REMOVED***'
const client_id = '***REMOVED***';
const client_secret = '***REMOVED***';
const redirectUrl = 'http://localhost:5000/callback';
const scopes = 'openid profile email accounting.settings accounting.reports.read accounting.journals.read accounting.contacts accounting.attachments accounting.transactions offline_access';
const xero = new xero_node_sdk_1.XeroClient({
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
        this.app.set('views', __dirname + '/views');
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
                yield xero.setAccessTokenFromRedirectUri(req.query);
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
                let account = { name: "Foo" + helper_1.default.getRandomNumber(), code: "" + helper_1.default.getRandomNumber(), type: xero_node_sdk_1.AccountType.EXPENSE };
                let accountCreateResponse = yield xero.accountingApi.createAccount(xero.tenantIds[0], account);
                let accountID = accountCreateResponse.body.accounts[0].accountID;
                //GET ONE
                let accountGetResponse = yield xero.accountingApi.getAccount(xero.tenantIds[0], accountID);
                //UPDATE
                let accountUp = { name: "Updated Account" + +helper_1.default.getRandomNumber() };
                let accounts = { accounts: [accountUp] };
                let accountUpdateResponse = yield xero.accountingApi.updateAccount(xero.tenantIds[0], accountID, accounts);
                let accountAttachmentsResponse = yield xero.accountingApi.createAccountAttachmentByFileName(xero.tenantIds[0], accountID, "helo-heros.jpg", "hello");
                /*
                async function main(data) {
                  let fileSize = fs.statSync(path.resolve(__dirname, "../public/images/helo-heros.jpg")).size;
                  let options = { headers: {"Content-Type" : "image/jpeg", "Content-length" : "" + fileSize} }
                  let accountAttachmentsResponse = await xero.accountingApi.createAccountAttachmentByFileName(xero.tenantIds[0],accountID,"helo-heros.jpg",data.toString(),options);
                  console.log("HELLO");
                }
        
                var data = '';
                var readStream = fs.createReadStream(path.resolve(__dirname, "../public/images/helo-heros.jpg"), 'utf8');
        
                readStream.on('data', function(chunk) {
                    data += chunk;
                }).on('end', function() {
                    //console.log(data);
                    main(data);
                });
               
                */
                /*
                await fs.readFile(path.resolve(__dirname, "../public/images/helo-heros.jpg"), 'utf8',function(err, data) {
                  if (err) throw err;
                  main(data);
                });
                */
                //let accountAttachmentsResponse = await xero.accountingApi.getAccountAttachments(xero.tenantIds[0],accountID);
                //console.log(accountAttachmentsResponse.body.attachments[0].attachmentID);
                //DELETE
                //        let accountDeleteResponse = await xero.accountingApi.deleteAccount(xero.tenantIds[0],accountID);
                // accountDeleteResponse.body.accounts[0].name
                res.render('accounts', {
                    getAllCount: accountsGetResponse.body.accounts.length,
                    getOneName: accountGetResponse.body.accounts[0].name,
                    createName: accountCreateResponse.body.accounts[0].name,
                    updateName: accountUpdateResponse.body.accounts[0].name,
                    deleteName: "foo"
                });
            }
            catch (e) {
                console.log("ERROR");
                console.log(e);
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/banktransactions', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                let apiResponse = yield xero.accountingApi.getBankTransactions(xero.tenantIds[0]);
                res.render('banktransactions', { count: apiResponse.body.bankTransactions.length });
            }
            catch (e) {
                res.status(500);
                res.send(e);
            }
        }));
        router.get('/banktranfers', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                let accessToken = req.session.accessToken;
                yield xero.setTokenSet(accessToken);
                let apiResponse = yield xero.accountingApi.getBankTransfers(xero.tenantIds[0]);
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
                let apiResponse = yield xero.accountingApi.getBatchPayments(xero.tenantIds[0]);
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
                let apiResponse = yield xero.accountingApi.getBrandingThemes(xero.tenantIds[0]);
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
                let apiResponse = yield xero.accountingApi.getContacts(xero.tenantIds[0]);
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
                let apiResponse = yield xero.accountingApi.getContactGroups(xero.tenantIds[0]);
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
                let apiResponse = yield xero.accountingApi.getCreditNotes(xero.tenantIds[0]);
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
                let apiResponse = yield xero.accountingApi.getCurrencies(xero.tenantIds[0]);
                res.render('currencies', { count: apiResponse.body.currencies.length });
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
                let apiResponse = yield xero.accountingApi.getInvoices(xero.tenantIds[0]);
                res.render('invoices', { count: apiResponse.body.invoices.length });
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
                let apiResponse = yield xero.accountingApi.getOrganisations(xero.tenantIds[0]);
                res.render('organisations', { name: apiResponse.body.organisations[0].name });
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
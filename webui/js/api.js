/*!
 * Iguana api config
 *
 */

// TODO: 1) add response handler
//       2) generalize get/post functions into one
//       3) add general error handler, e.g. coin is not added, wallet is locked etc
//       4) add localstorage hook on testPort success
//      (?) refactor conf into a singleton obj

// note(!): p2p may vary depending on a coin
// some coins put rpc at the p2p port+1 others port-1
// if no portp2p is specified iguana picks default port
// possible solution: check adjacent ports to verify which one is responding

// add rt sync check for btc and btcd
// https://blockexplorer.com/api/status?q=getBlockCount
// http://explorebtcd.info/api/status?q=getBlockCount

var apiProto = function() {};

var activeCoin,
    portsTested = false,
    isIguana = false,
    isRT = false,
    proxy = "http://localhost:1337/"; // https://github.com/gr2m/CORS-Proxy

apiProto.prototype.getConf = function(discardCoinSpecificPort) {
  var conf = {
      "server": {
        "protocol": "http://",
        "ip": "localhost",
        "iguanaPort": "7778"
      },
      "apiRoutes": {
        "bitcoinRPC" : {
          "walletPassphrase" : "bitcoinrpc/walletpassphrase", // params: password String, timeout Int
          "encryptWallet" : "bitcoinrpc/encryptwallet", // params: passphrase String
          "listTransactions": "bitcoinrpc/listtransactions", // params: account String, count: default is 1
          "getTransaction": "bitcoinrpc/gettransaction", // params: txid String
          "getBalance": "bitcoinrpc/getbalance" // params: account String
        },
        "iguana": {
          "addCoin": "iguana/addcoin", // params newcoin, portp2p, services
          "rates": "iguana/rates", // params: coin/curency or currency/currency or coin/coin, variable length
          "rate": "iguana/rate" // params: base, rel e.g. base=BTC&rel=USD, !param values in CAPS!
        }
      },
      "coins": {
        "btc": {
          "services": 129,
          "portp2p": 8332,
          "user": "pbca26", // add your rpc pair here
          "pass": "pbca26",
          "currentBlockHeightExtSource": "https://blockexplorer.com/api/status?q=getBlockCount"
        },
        "btcd": {
          "services": 0,
          "portp2p": 14632,
          "user": "user", // add your rpc pair here
          "pass": "pass",
          "currentBlockHeightExtSource": "http://explorebtcd.info/api/status?q=getBlockCount"
        }
      }
  };

  //if (!portsTested) apiProto.prototype.testConnection();

  // coin port switch hook
  if (activeCoin && !discardCoinSpecificPort)
    conf.server.port = conf.coins[activeCoin].portp2p;
  else
    conf.server.port = conf.server.iguanaPort;

  // bitcoind rpc hook
  // if rpc user and password are supplied it should communicate with bitcoin/altcoin
  /*if (activeCoin && !iguanaEnv && conf.coins[activeCoin].user && conf.coins[activeCoin].pass) // inject user:pass@
    conf.server.ip = conf.coins[activeCoin].user + ":" + conf.coins[activeCoin].pass + "@" + conf.server.ip;*/

  //console.log(conf.server);

  return conf;
}

apiProto.prototype.errorHandler = function(response) {
  if (response.error === "need to unlock wallet") {
    console.log("unexpected crash or else");
    helperProto.prototype.logout();
  }
  if (response.error === "iguana jsonstr expired") {
    console.log("server is busy");
  }
}

apiProto.prototype.getServerUrl = function(discardCoinSpecificPort) {
  return apiProto.prototype.getConf().server.protocol + apiProto.prototype.getConf().server.ip + ":" + apiProto.prototype.getConf(discardCoinSpecificPort).server.port + "/api/";
}

apiProto.prototype.getBasicAuthHeaderObj = function(conf) {
  if (conf)
    return isIguana ? "" : { "Authorization": "Basic " + btoa(conf.user + ":" + conf.pass) };
  else
    return isIguana ? "" : { "Authorization": "Basic " + btoa(apiProto.prototype.getConf().coins[activeCoin].user + ":" + apiProto.prototype.getConf().coins[activeCoin].pass) };
}

apiProto.prototype.getBitcoinRPCPayloadObj = function(method, params) {
  return "{ \"agent\": \"bitcoinrpc\", \"method\": \"" + method + "\", \"params\": [" + (!params ? "" : params) + "] }";
}

apiProto.prototype.getFullApiRoute = function(method, conf) {
  if (conf)
    return isIguana ? apiProto.prototype.getConf().server.protocol + apiProto.prototype.getConf().server.ip + ":" + conf.portp2p + "/api/bitcoinrpc/" + method : proxy + apiProto.prototype.getConf().server.ip + ":" + conf.portp2p;
  else
    return isIguana ? apiProto.prototype.getConf().server.protocol + apiProto.prototype.getConf().server.ip + ":" + apiProto.prototype.getConf().server.port + "/api/bitcoinrpc/" + method : proxy + apiProto.prototype.getConf().server.ip + ":" + apiProto.prototype.getConf().server.port;
}

// test must be hooked to initial gui start or addcoin method
// test 1 port for a single coin
apiProto.prototype.testCoinPorts = function() {
  var result = false,
      _index = 0; /*,
      repeat = 3; // check default port, port+1, port-1*/

  $.each(apiProto.prototype.getConf().coins, function(index, conf) {
    var fullUrl = apiProto.prototype.getFullApiRoute("getinfo", conf);
    var postData = apiProto.prototype.getBitcoinRPCPayloadObj("getinfo");
    var postAuthHeaders = apiProto.prototype.getBasicAuthHeaderObj(conf);

    $.ajax({
      url: fullUrl,
      cache: false,
      async: true,
      dataType: "json",
      type: "POST",
      data: postData,
      headers: postAuthHeaders,
      success: function(response) {
        apiProto.prototype.errorHandler(response);
        console.log(response);

        if (response.result.walletversion || response.result === "success") {
          // non-iguana
          var networkCurrentHeight = apiProto.prototype.getCoinCurrentHeight(index);
          console.log('portp2p con test passed');
          console.log(index + ' daemon is detected');
          console.log("Connections: " + response.result.connections);
          console.log("Blocks: " + response.result.blocks + "/" + networkCurrentHeight + " (" + (response.result.blocks * 100 / networkCurrentHeight).toFixed(2) + "% synced)");
          activeCoin = index;

          if (response.result.blocks === networkCurrentHeight) {
            isRT = true;
          } else {
            isRT = false;
            console.log("RT is not ready yet!");
          }
        }
        if (response.status) {
          // iguana
          if (response.status.indexOf(".RT0 ") > -1) {
            var iguanaGetInfo = response.status.split(" ");
            var totalBundles = iguanaGetInfo[20].split(":");
            var currentHeight = iguanaGetInfo[9].replace("h.", "");
            var peers = iguanaGetInfo[16].split("/");

            console.log("Connections: " + peers[0].replace("peers.", ""));
            console.log("Blocks: " + currentHeight);
            console.log("Bundles: " + iguanaGetInfo[14].replace("E.", "") + "/" + totalBundles[0] + " (" + (iguanaGetInfo[14].replace("E.", "") * 100 / totalBundles[0]).toFixed(2) + "% synced)");
            console.log("RT is not ready yet!");

            isRT = false;
          } else {
            isRT = true;
          }
        } else {
        }
      },
      error: function(response) {
        apiProto.prototype.errorHandler(response);

        if (response.statusText === "error" && !isIguana) console.log("is proxy server running?");
        else if (!response.statusCode) console.log("server is busy, check back later");
        if (response.responseText.indexOf("Verifying blocks...") > -1) console.log("coind is verifying blocks...");

        console.log(response.responseText);

        if (Object.keys(apiProto.prototype.getConf().coins).length - 1 === _index && !activeCoin) console.log("no coin is detected, at least one daemon must be running!");
        _index++;
      }
    }).done(function() {
      if (Object.keys(apiProto.prototype.getConf().coins).length - 1 === _index && !activeCoin) console.log("no coin is detected, at least one daemon must be running!");
      _index++;
    });
  });

  return result;
}

// check if iguana is running
apiProto.prototype.testConnection = function() {
  var result = false;

  // test if iguana is running
  var defaultIguanaServerUrl = apiProto.prototype.getConf().server.protocol + apiProto.prototype.getConf().server.ip + ":" + apiProto.prototype.getConf().server.iguanaPort;
  $.ajax({
    url: defaultIguanaServerUrl + "/api/iguana/getconnectioncount",
    cache: false,
    dataType: "text",
    async: false,
    type: 'GET',
    success: function (response) {
      apiProto.prototype.errorHandler(response);
      // iguana env
      console.log('iguana is detected');
      isIguana = true;
      apiProto.prototype.testCoinPorts();
    },
    error: function (response) {
      apiProto.prototype.errorHandler(response);
      // non-iguana env
      console.log('running non-iguana env');
      apiProto.prototype.testCoinPorts();
    }
  });

  portsTested = true;
}

apiProto.prototype.walletLogin = function(passphrase, timeout) {
  var result = false;

  var fullUrl = apiProto.prototype.getFullApiRoute("walletpassphrase");
  var postData = apiProto.prototype.getBitcoinRPCPayloadObj("walletpassphrase", "\"" + passphrase + "\", " + timeout);
  var postAuthHeaders = apiProto.prototype.getBasicAuthHeaderObj();

  $.ajax({
    url: fullUrl,
    cache: false,
    async: false,
    dataType: "json",
    type: "POST",
    data: postData,
    headers: postAuthHeaders,
    success: function(response) {
      console.log(response);
      result = true;
    },
    error: function(response) {
      if (response.responseText) {
        if (response.responseText.indexOf("Error: Wallet is already unlocked, use walletlock first if need to change unlock settings.") > -1)
          result = true;
        console.log(response.responseText);
      } else {
        console.log(response.error);
      }
    }
  });

  return result;
}

apiProto.prototype.walletCreate = function(passphrase) {
  var result = false;

  var fullUrl = apiProto.prototype.getFullApiRoute("encryptwallet");
  var postData = apiProto.prototype.getBitcoinRPCPayloadObj("encryptwallet", "\"" + passphrase + "\"");
  var postAuthHeaders = apiProto.prototype.getBasicAuthHeaderObj();

  $.ajax({
    url: fullUrl,
    cache: false,
    async: false,
    dataType: "json",
    type: "POST",
    data: postData,
    headers: postAuthHeaders
  })
  .done(function(_response) {
    console.log(_response);
    apiProto.prototype.errorHandler(_response);
    if (_response.result) {
      // non-iguana
      if (_response.result) {
        result = _response.result;
      } else {
        result = false;
      }
    } else {
      // iguana
      var response = $.parseJSON(_response);

      if (response.error) {
        // do something
        console.log("error: " + response.error);
        result = false;
      } else {
        if (response.result === "success") {
          result = response;
        } else {
          result = false;
        }
      }
    }
  });

  return result;
}

apiProto.prototype.listTransactions = function(account) {
  var result = false;

  var fullUrl = apiProto.prototype.getFullApiRoute("listtransactions");
  var postData = apiProto.prototype.getBitcoinRPCPayloadObj("listtransactions", "\"" + account + "\", 19"); // last 20 tx
  var postAuthHeaders = apiProto.prototype.getBasicAuthHeaderObj();

  $.ajax({
    url: fullUrl,
    cache: false,
    async: false,
    dataType: "json",
    type: "POST",
    data: postData,
    headers: postAuthHeaders
  })
  .done(function(_response) {
    apiProto.prototype.errorHandler(_response);

    console.log(_response);
    if (_response.result) {
      // non-iguana
      if (_response.result.length) {
        result = _response.result;
      } else {
        result = false;
      }
    } else {
      // iguana
      var response = $.parseJSON(_response);

      if (response.error) {
        // do something
        console.log("error: " + response.error);
        result = false;
      } else {
        if (response.result.length) {
          result = response.result;
        } else {
          result = false;
        }
      }
    }
  });

  return result;
}

apiProto.prototype.getTransaction = function(txid) {
  var result = false;

  var fullUrl = apiProto.prototype.getFullApiRoute("gettransaction");
  var postData = apiProto.prototype.getBitcoinRPCPayloadObj("gettransaction", "\"" + txid + "\"");
  var postAuthHeaders = apiProto.prototype.getBasicAuthHeaderObj();

  $.ajax({
    url: fullUrl,
    cache: false,
    async: false,
    dataType: "json",
    type: "POST",
    data: postData,
    headers: postAuthHeaders
  })
  .done(function(_response) {
    apiProto.prototype.errorHandler(_response);

    if (_response.result) {
      // non-iguana
      if (_response.result) {
        result = _response.result;
      } else {
        result = false;
      }
    } else {
      // iguana
      var response = _response;

      if (response.error) {
        // do something
        console.log("error: " + response.error);
        result = false;
      } else {
        if (response.txid) {
          result = response;
        } else {
          result = false;
        }
      }
    }
  });

  return result;
}

apiProto.prototype.getBalance = function(account) {
  var result = false;

  var fullUrl = apiProto.prototype.getFullApiRoute("getbalance");
  var postData = apiProto.prototype.getBitcoinRPCPayloadObj("getbalance", "\"" + account + "\"");
  var postAuthHeaders = apiProto.prototype.getBasicAuthHeaderObj();

  $.ajax({
    url: fullUrl,
    cache: false,
    async: false,
    dataType: "json",
    type: "POST",
    data: postData,
    headers: postAuthHeaders
  })
  .done(function(_response) {
    apiProto.prototype.errorHandler(_response);

    if (_response.result) {
      // non-iguana
      result = _response.result;
    } else {
      console.log(_response);

      // iguana
      var response = $.parseJSON(_response);

      if (response.error) {
        // do something
        console.log("error: " + response.error);
        result = false;
      } else {
        if (response) {
          result = response;
        } else {
          result = false;
        }
      }
    }
  });

  return result;
}

apiProto.prototype.walletLock = function() {
  var result = false;

  var fullUrl = apiProto.prototype.getFullApiRoute("walletlock");
  var postData = apiProto.prototype.getBitcoinRPCPayloadObj("walletlock");
  var postAuthHeaders = apiProto.prototype.getBasicAuthHeaderObj();

  $.ajax({
    url: fullUrl,
    cache: false,
    async: false,
    dataType: "json",
    type: "POST",
    data: postData,
    headers: postAuthHeaders
  })
  .done(function(_response) {
    apiProto.prototype.errorHandler(_response);

    if (_response.result) {
      // non-iguana
      result = _response.result;
    } else {
      console.log(_response);

      // iguana
      var response = $.parseJSON(_response);

      if (response.error) {
        // do something
        console.log("error: " + response.error);
        result = false;
      } else {
        if (response) {
          result = response;
        } else {
          result = false;
        }
      }
    }
  });

  return result;
}

/* not needed now

  apiProto.prototype.addCoin = function(coin) {
  var result = false;

  $.ajax({
    url: apiProto.prototype.getServerUrl(true) + apiProto.prototype.getConf().apiRoutes.iguana.addCoin + "?newcoin=" + coin.toUpperCase() + "&services=" + newCoinConf[coin].services + "&portp2p=" + newCoinConf[coin].portp2p,
    cache: false,
    dataType: "text",
    async: false
  })
  .done(function(_response) {
    var response = $.parseJSON(_response);

    if (response.error) {
      // do something
      console.log("error: " + response.error);
      result = false;
    } else {
      if (response.result === "coin added" || response.result === "coin already there") {
        result = response;
      } else {
        result = false;
      }
    }
  });

  return result;
}*/

/* external block explorer website */
apiProto.prototype.getCoinCurrentHeight = function(coin) {
  var result = false;

  $.ajax({
    url: apiProto.prototype.getConf().coins[coin].currentBlockHeightExtSource,
    cache: false,
    dataType: "text",
    async: false
  })
  .done(function(_response) {
    var response = $.parseJSON(_response);
    console.log(response);

    if (response.blockcount || response.info.blocks) {
      if (response.blockcount) result = response.blockcount;
      if (response.info) result = response.info.blocks;
    } else {
      console.log("error retrieving current block height from " + apiProto.prototype.getConf().coins[coin].currentBlockHeightExtSource);
      result = false;
    }
  });

  return result;
}

/* !requires the latest iguana build! */
apiProto.prototype.getIguanaRate = function(quote) {
  var result = false;
  var quoteComponents = quote.split("/");

  $.ajax({
    url: apiProto.prototype.getServerUrl(true) + apiProto.prototype.getConf().apiRoutes.iguana.rate + "?base=" + quoteComponents[0] + "&rel=" + quoteComponents[1],
    cache: false,
    dataType: "text",
    async: false
  })
  .done(function(_response) {
    var response = $.parseJSON(_response);

    if (response.error) {
      // do something
      console.log("error: " + response.error);
      result = false;
    } else {
      if (response.result === "success") {
        result = response.quote;
      } else {
        result = false;
      }
    }
  });

  return result;
}

// get a quote form an external source
// cryptonator is officially closed it's gates, no more cors
// keep an eye on, may be they'll change their mind
apiProto.prototype.getExternalRate = function(quote) {
  var result = false,
      firstSourceFailed = false,
      quoteComponents = quote.split("/");

  quote = quote.toLowerCase().replace("/", "-");
  $.ajax({
    url: "https://min-api.cryptocompare.com/data/price?fsym=" + quoteComponents[0] + "&tsyms=" + quoteComponents[1],
    cache: false,
    dataType: "text",
    async: false,
    success: function(_response) {
      var response = $.parseJSON(_response);

      if (response && response[quoteComponents[1]]) {
        result = response[quoteComponents[1]];
        console.log("rates source https://min-api.cryptocompare.com");
      } else {
        result = false;
      }
    },
    error: function(response) {
      console.log('falling back to ext service #2');
      firstSourceFailed = true;
    }
  });

  if (firstSourceFailed)
    $.ajax({
      // cryptocoincharts doesn't have direct conversion altcoin -> currency
      // needs 2 requests at a time, one to get btc -> currency rate, another to get btc -> altcoin rate
      url: "http://api.cryptocoincharts.info/tradingPair/btc_" + quoteComponents[1].toLowerCase(),
      cache: false,
      dataType: "text",
      async: false,
      success: function(_response) {
        var response = $.parseJSON(_response);

        if (response.price) {
          btcToCurrency = response.price;

          // get btc -> altcoin rate
          $.ajax({
            url: "https://poloniex.com/public?command=returnTicker",
            cache: false,
            dataType: "text",
            async: false,
            success: function(_response) {
              var response = $.parseJSON(_response);

              if (response["BTC_" + quoteComponents[0].toUpperCase()]) {
                result = btcToCurrency * response["BTC_" + quoteComponents[0].toUpperCase()].last;
                console.log("rates source http://api.cryptocoincharts.info and https://poloniex.com");
              } else {
                result = false;
              }
            },
            error: function(response) {
              console.log('both services are failed to respond');
            }
          });
        } else {
          result = false;
        }
      },
      error: function(response) {
        console.log('both services failed to respond');
      }
    });

  return result;
}

apiProto.prototype.testConnection(); // run this everytime a page is (re)loaded
'use strict';

angular.module('IguanaGUIApp.controllers')
.controller('dashboardController', ['$scope', '$http', '$state', 'helper', 'passPhraseGenerator', '$timeout', '$interval', '$localStorage',
  function($scope, $http, $state, helper, passPhraseGenerator, $timeout, $interval, $localStorage) {
    $scope.helper = helper;
    $scope.$state = $state;
    $scope.isIguana = isIguana;
    $scope.enabled = helper.checkSession(true);
    $scope.receiveCoin = {
      address: '',
      qrCode: ''
    };

    var defaultCurrency = helper.getCurrency() ? helper.getCurrency().name : null || settings.defaultCurrency,
        defaultAccount = isIguana ? settings.defaultAccountNameIguana : settings.defaultAccountNameCoind;

    $('body').addClass('dashboard-page');

    $(document).ready(function() {
      initTopNavBar();

      $('body').scroll(function(e){
        if ($(window).width() < 768) {
          if ($('.main-content,.currency-content').position().top  < -270) {
            $('#top-menu').addClass('hidden');
          } else {
            $('#top-menu').removeClass('hidden');
          }
        }
      })
      updateDashboardView(settings.ratesUpdateTimeout);
    });

    $(window).resize(function() {
      applyDashboardResizeFix();
    });

    // TODO: merge all dashboard data into a single object for caching
    $scope.currency = defaultCurrency;
    $scope.totalBalance = 0;
    $scope.sideBarCoins;
    $scope.txUnit = {
      'loading': true,
      activeCoinBalance: 0,
      activeCoinBalanceCurrency: 0,
      transactions: []
    };
    $scope.sideBarCoinsUnsorted = {};
    $scope.activeCoin = $localStorage['iguana-active-coin'] && $localStorage['iguana-active-coin'].id ? $localStorage['iguana-active-coin'].id : 0;
    $scope.addCoinButtonState = true;
    $scope.disableRemoveCoin = dev.isDev && !isIguana ? false : true; // dev

    var coinBalances = [],
        _sideBarCoins = {},
        coinsSelectedByUser = [],
        dashboardUpdateTimer;

    constructAccountCoinRepeater(true);

    $scope.setActiveCoin = function(item) {
      $localStorage['iguana-active-coin'] = { id: item.id };
      $scope.activeCoin = item.id;
      $scope.setTxUnitBalance(item);
      constructTransactionUnitRepeater();
      getReceiveCoinAddress();
    }

    $scope.setTxUnitBalance = function(item) {
      $scope.txUnit.activeCoinBalance = item ? item.coinValue : $scope.sideBarCoinsUnsorted[$scope.activeCoin].coinValue;
      $scope.txUnit.activeCoinBalanceCurrency = item ? item.currencyValue : $scope.sideBarCoinsUnsorted[$scope.activeCoin].currencyValue;
    }

    $scope.removeCoin = function(coinId) {
      if (confirm(helper.lang('DASHBOARD.ARE_YOU_SURE_YOU_WANT') + ' ' + $scope.sideBarCoinsUnsorted[coinId].name) === true) {
        $localStorage['iguana-' + coinId + '-passphrase'] = { 'logged': 'no' };

        delete $scope.sideBarCoinsUnsorted[coinId];
        $scope.sideBarCoins = Object.keys($scope.sideBarCoinsUnsorted).map(function(key) {
          return $scope.sideBarCoinsUnsorted[key];
        });

        if ($scope.activeCoin === coinId) $scope.setActiveCoin($scope.sideBarCoins[0]);
        checkAddCoinButton();
        updateTotalBalance();
      }
    }

    //api.checkBackEndConnectionStatus();
    //applyDashboardResizeFix();

    function constructAccountCoinRepeater(isFirstRun) {
      var index = 0;

      for (var key in coinsInfo) {
        if ((isIguana && $localStorage['iguana-' + key + '-passphrase'] && $localStorage['iguana-' + key + '-passphrase'].logged === 'yes') ||
            (!isIguana && $localStorage['iguana-' + key + '-passphrase'] && $localStorage['iguana-' + key + '-passphrase'].logged === 'yes')) {
          coinsSelectedByUser[index] = key;
          index++;
        }
      }

      if (coinsSelectedByUser.length && !$scope.activeCoin) $scope.activeCoin = coinsSelectedByUser[0];

      coinBalances = [];

      for (var i=0; i <coinsSelectedByUser.length; i++) {
        if (isFirstRun) {
          _sideBarCoins[coinsSelectedByUser[i]] = {
            id: coinsSelectedByUser[i],
            coinIdUc: coinsSelectedByUser[i].toUpperCase(),
            name: supportedCoinsList[coinsSelectedByUser[i]].name,
            loading: true
          };

          $scope.sideBarCoins = Object.keys(_sideBarCoins).map(function(key) {
            return _sideBarCoins[key];
          });
        }
        applyDashboardResizeFix();
        api.getBalance(defaultAccount, coinsSelectedByUser[i], constructAccountCoinRepeaterCB);
      }
    }

    // construct account coins array
    function constructAccountCoinRepeaterCB(balance, coin) {
      var coinLocalRate = helper.updateRates(coin.toUpperCase(), defaultCurrency, true) || 0,
          currencyCalculatedValue = balance * coinLocalRate,
          coinBalanceVal = balance || 0,
          coinBalanceCurrencyVal = currencyCalculatedValue || 0;

      coinBalances[coin] = balance;
      _sideBarCoins[coin] = {
        id: coin,
        name: supportedCoinsList[coin].name,
        coinBalanceUnformatted: balance,
        coinValue: coinBalanceVal,
        coinIdUc: coin.toUpperCase(),
        currencyValue: coinBalanceCurrencyVal,
        currencyName: defaultCurrency,
        loading: false
      };

      $scope.sideBarCoins = Object.keys(_sideBarCoins).map(function(key) {
        return _sideBarCoins[key];
      });
      $scope.sideBarCoinsUnsorted = _sideBarCoins;

      applyDashboardResizeFix();

      // run balances and tx unit update once left sidebar is updated
      if (Object.keys(coinsSelectedByUser).length === Object.keys(coinBalances).length) {
        checkAddCoinButton();
        updateTotalBalance();
        $scope.setTxUnitBalance();
        constructTransactionUnitRepeater();
      }
    }

    // TODO: watch coinsInfo, checkAddCoinButton and connectivity status

    function checkAddCoinButton() {
      // disable add wallet/coin button if all coins/wallets are already in the sidebar
      var _coinsLeftToAdd = 0;
      for (var key in supportedCoinsList) {
        if (!$localStorage['iguana-' + key + '-passphrase'] || $localStorage['iguana-' + key + '-passphrase'] && $localStorage['iguana-' + key + '-passphrase'].logged !== 'yes') {
          if ((isIguana && coinsInfo[key].iguana !== false) || (!isIguana && coinsInfo[key].connection === true)) {
            _coinsLeftToAdd++;
          }
        }
      }
      //$scope.addCoinButtonState = _coinsLeftToAdd > 0 ? true : false; // TODO: fix, breaks on portpoll
    }

    function updateTotalBalance() {
      var sidebarCoins = $scope.sideBarCoinsUnsorted,
          _totalBalance = 0;

      for (var key in sidebarCoins) {
        var coinLocalRate = helper.updateRates(key, defaultCurrency, true) || 0;
        _totalBalance += coinLocalRate * sidebarCoins[key].coinBalanceUnformatted;
      }

      $scope.totalBalance = _totalBalance || 0;
    }

    // construct transaction unit array
    function constructTransactionUnitRepeater(update) {
      if (!update) $scope.txUnit.loading = true;

      $scope.txUnit.transactions = []; // TODO: tx unit flickers on active coin change
      api.listTransactions(defaultAccount, $scope.activeCoin, constructTransactionUnitRepeaterCB);
    }

    // new tx will appear at the top of the list
    // while old tx are going to be removed from the list
    function constructTransactionUnitRepeaterCB(response) {
      var transactionsList = response,
          decimalPlacesTxUnit = settings.decimalPlacesTxUnit;
      // sort tx in desc order by timestamp
      if (transactionsList) {
        if (transactionsList.length) $scope.txUnit.loading = false;
        for (var i=0; i < transactionsList.length; i++) {
          $scope.txUnit.transactions[i] = {};
          if (transactionsList[i].txid) {
            // TODO: add func to evaluate tx time in seconds/minutes/hours/a day from now e.g. 'a moment ago', '1 day ago' etc
            // timestamp is converted to 24h format
            var transactionDetails = transactionsList[i],
                txIncomeOrExpenseFlag = '',
                txStatus = 'N/A',
                txCategory = '',
                txAddress = '',
                txAmount = 'N/A',
                iconSentClass = 'bi_interface-minus',
                iconReceivedClass = 'bi_interface-plus';

            if (transactionDetails)
              if (transactionDetails.details) {
                txAddress = transactionDetails.details[0].address;
                txAmount = transactionDetails.details[0].amount;
                // non-iguana
                if (transactionDetails.details[0].category)
                  txCategory = transactionDetails.details[0].category;

                  if (transactionDetails.details[0].category === 'send') {
                    txIncomeOrExpenseFlag = iconSentClass;
                    txStatus = helper.lang('DASHBOARD.SENT');
                  } else {
                    txIncomeOrExpenseFlag = iconReceivedClass;
                    txStatus = helper.lang('DASHBOARD.RECEIVED');
                  }
              } else {
                // iguana
                txAddress = transactionsList[i].address || transactionDetails.address;
                txAmount = transactionsList[i].amount;
                txStatus = transactionDetails.category || transactionsList[i].category;
                txCategory = transactionDetails.category || transactionsList[i].category;

                if (txStatus === 'send') {
                  txIncomeOrExpenseFlag = iconSentClass;
                  txStatus = helper.lang('DASHBOARD.SENT');
                } else {
                  txIncomeOrExpenseFlag = iconReceivedClass;
                  txStatus = helper.lang('DASHBOARD.RECEIVED');
                }
              }

            if (transactionDetails) {
              if (Number(transactionDetails.confirmations) && Number(transactionDetails.confirmations) < settings.txUnitProgressStatusMinConf) {
                txStatus = helper.lang('DASHBOARD.IN_PROCESS');
                txCategory = 'process';
              }
              if (isIguana && txAmount !== undefined || !isIguana)
                $scope.txUnit.transactions[i].txId = transactionDetails.txid;
                $scope.txUnit.transactions[i].status = txStatus;
                $scope.txUnit.transactions[i].statusClass = txCategory;
                $scope.txUnit.transactions[i].confs = transactionDetails.confirmations ? transactionDetails.confirmations : 'n/a';
                $scope.txUnit.transactions[i].inOut = txIncomeOrExpenseFlag;
                $scope.txUnit.transactions[i].amount = txAmount > 0 ? Math.abs(txAmount.toFixed(decimalPlacesTxUnit)) : Math.abs(txAmount);
                $scope.txUnit.transactions[i].timestampFormat = 'timestamp-multi';
                $scope.txUnit.transactions[i].coin = $scope.activeCoin.toUpperCase();
                $scope.txUnit.transactions[i].hash = txAddress !== undefined ? txAddress : 'N/A';
                $scope.txUnit.transactions[i].switchStyle = (txAmount.toString().length > 8 ? true : false); // mobile only
                $scope.txUnit.transactions[i].timestampUnchanged = transactionDetails.blocktime ||
                                                                   transactionDetails.timestamp ||
                                                                   transactionDetails.time;
                $scope.txUnit.transactions[i].timestampDate = helper.convertUnixTime(transactionDetails.blocktime ||
                                                                                transactionDetails.timestamp ||
                                                                                transactionDetails.time, 'DDMMMYYYY');
                $scope.txUnit.transactions[i].timestampTime = helper.convertUnixTime(transactionDetails.blocktime ||
                                                                                transactionDetails.timestamp ||
                                                                                transactionDetails.time, 'HHMM');
            }
          }
        }
      }

      $scope.$apply(); // manually trigger digest
      applyDashboardResizeFix();
    }

    // not the best solution but it works
    function applyDashboardResizeFix() {
      var mainContent = $('.main-content'),
          txUnit = $('.transactions-unit');

      // tx unit resize
      if ($(window).width() > 767) {
        var width = Math.floor(mainContent.width() - $('.coins').width() - 80);
        mainContent.css({ 'padding': '0 30px' });
        txUnit.css({ 'max-width': width, 'width': width });
      } else {
        txUnit.removeAttr('style');
        mainContent.removeAttr('style');
      }

      // coin tiles on the left
      if ($scope.sideBarCoins) {
        var accountCoinsRepeaterItem = '.account-coins-repeater .item';

        for (var i=0; i < $scope.sideBarCoins.length; i++) {
          var coin = $scope.sideBarCoins[i].id;

          $(accountCoinsRepeaterItem + '.' + coin + ' .coin .name').css({ 'width': Math.floor($(accountCoinsRepeaterItem + '.' + coin).width() -
                                                                                              $(accountCoinsRepeaterItem + '.' + coin + ' .coin .icon').width() -
                                                                                              $(accountCoinsRepeaterItem + '.' + coin + ' .balance').width() - 50) });
        }
      }
    }

    function updateDashboardView(timeout) {
      dashboardUpdateTimer = $interval(function() {
        //console.clear();
        helper.checkSession();
        helper.updateRates(null, null, null, true);
        constructAccountCoinRepeater();

        if (dev.showConsoleMessages && dev.isDev) console.log('dashboard updated');
      }, timeout * 1000);
    }

    /*
     *  add coin modal
     */
    // TODO: move to service
    $scope.passphrase = '';
    $scope.coinsSelectedToAdd = {};

    $scope.toggleLoginModal = function() {
      helper.toggleModalWindow('add-coin-login-form', 300);
    }

    $scope.toggleAddCoinModal = function() {
      var availableCoins = helper.constructCoinRepeater();
      helper.toggleModalWindow('add-new-coin-form', 300);

      $scope.availableCoins = availableCoins;
      $scope.wordCount = isIguana ? 24 : 12; // TODO: move to settings

      helper.bindCoinRepeaterSearch();
    }

    $scope.objLen = function(obj) {
      return Object.keys(obj).length;
    }

    $scope.toggleCoinTile = function(item) {
      if ($scope.coinsSelectedToAdd[item.coinId]) {
        delete $scope.coinsSelectedToAdd[item.coinId];
      } else {
        $scope.coinsSelectedToAdd[item.coinId] = true;
      }
      if (!isIguana) {
        var selectedCoind = $scope.coinsSelectedToAdd[item.coinId];

        $scope.coinsSelectedToAdd = {};
        if (selectedCoind) $scope.coinsSelectedToAdd[item.coinId] = selectedCoind;
      }
    }

    $scope.toggleAddCoinWalletCreateModal = function(initOnly) {
      $scope.addCoinCreateAccount = {
        passphrase: passPhraseGenerator.generatePassPhrase(isIguana ? 8 : 4),
        wordCount: 12,
        passphraseSavedCheckbox: false,
        passphraseVerify: '',
        initStep: true,
        copyToClipboardNotSupported: false
      };

      if (!initOnly) helper.toggleModalWindow('add-coin-create-wallet-form', 300);
    }

    $scope.copyPassphrase = function() {
      $scope.addCoinCreateAccount.copyToClipboardNotSupported = helper.addCopyToClipboardFromElement('.generated-passhprase', helper.lang('LOGIN.PASSPHRASE'));
    }

    $scope.encryptCoindWallet = function() {
      encryptCoindWallet();
    }

    function encryptCoindWallet(modalClassName) {
      var addCoinCreateWalletModalClassName = 'add-coin-create-wallet-form';

      var coinsSelectedToAdd = helper.reindexAssocArray($scope.coinsSelectedToAdd);

      if ($scope.addCoinCreateAccount.passphrase === $scope.addCoinCreateAccount.passphraseVerify) {
        var walletEncryptResponse = api.walletEncrypt($scope.addCoinCreateAccount, coinsSelectedToAdd[0]);

        if (walletEncryptResponse !== -15) {
          helper.toggleModalWindow(addCoinCreateWalletModalClassName, 300);
          helper.prepMessageModal(supportedCoinsList[coinsSelectedToAdd[0]].name + helper.lang('MESSAGE.X_WALLET_IS_CREATED'), 'green', true);
        } else {
          helper.toggleModalWindow(addCoinCreateWalletModalClassName, 300);
          helper.prepMessageModal(helper.lang('MESSAGE.WALLET_IS_ALREADY_ENCRYPTED'), 'red', true);
        }
      } else {
        helper.prepMessageModal(helper.lang('MESSAGE.PASSPHRASES_DONT_MATCH_ALT'), 'red', true);
      }
    }

    $scope.loginWallet = function() {
      // coind
      var coinsSelectedToAdd = helper.reindexAssocArray($scope.coinsSelectedToAdd);
      api.walletLock(coinsSelectedToAdd[0]);
      var walletLogin = api.walletLogin($scope.passphrase, settings.defaultSessionLifetime, coinsSelectedToAdd[0]);

      if (walletLogin !== -14 && walletLogin !== -15) {
        $localStorage['iguana-' + coinsSelectedToAdd[0] + '-passphrase'] = { 'logged': 'yes' };
        helper.updateRates(null, null, null, true);
        constructAccountCoinRepeater();

        _sideBarCoins[coinsSelectedToAdd[0]] = {
          id: coinsSelectedToAdd[0],
          coinIdUc: coinsSelectedToAdd[0].toUpperCase(),
          name: supportedCoinsList[coinsSelectedToAdd[0]].name,
          loading: true
        };

        $scope.sideBarCoins.push(_sideBarCoins[coinsSelectedToAdd[0]]);

        applyDashboardResizeFix();
        api.getBalance(defaultAccount, coinsSelectedToAdd[0], constructAccountCoinRepeaterCB);

        $scope.toggleLoginModal();
      }
      if (walletLogin === -14) {
        helper.prepMessageModal(helper.lang('MESSAGE.WRONG_PASSPHRASE'), 'red', true);
      }
      if (walletLogin === -15) {
        helper.prepMessageModal(helper.lang('MESSAGE.PLEASE_ENCRYPT_YOUR_WALLET'), 'red', true);
      }
    }

    $scope.addCoinNext = function() {
      if (!isIguana) {
        helper.toggleModalWindow('add-new-coin-form', 300);
        var coinsSelectedToAdd = helper.reindexAssocArray($scope.coinsSelectedToAdd);

        // dev only
        if (dev.isDev && !isIguana && dev.coinPW.coind[coinsSelectedToAdd[0]]) $scope.passphrase = dev.coinPW.coind[coinsSelectedToAdd[0]];
        if (dev.isDev && isIguana && dev.coinPW.iguana) $scope.passphrase = dev.coinPW.iguana;
      } else {
        coinsSelectedToAdd = helper.reindexAssocArray(coinsSelectedToAdd);

        for (var i=0; i < coinsSelectedToAdd.length; i++) {
          if (coinsSelectedToAdd[i]) {
            (function(x) {
              $timeout(function() {
                api.addCoin(coinsSelectedToAdd[x], addCoinDashboardCB);
              }, x === 0 ? 0 : settings.addCoinTimeout * 1000);
            })(i);
          }
        }
      }
    }

    function addCoinDashboardCB(response, coin) {
      if (response === 'coin added' || response === 'coin already there') {
        if (dev.isDev && dev.showSyncDebug) $('#debug-sync-info').append(coin + ' coin added<br/>');

        addCoinResponses.push({ 'coin': coin, 'response': response });
        coinsInfo[coin].connection = true; // update coins info obj prior to scheduled port poll
      }

      var addedCoinsOutput = '',
          failedCoinsOutput = '<br/>';
      for (var i=0; i < Object.keys(addCoinResponses).length; i++) {
        if (addCoinResponses[i].response === 'coin added' || addCoinResponses[i].response === 'coin already there') {
          addedCoinsOutput = addedCoinsOutput + addCoinResponses[i].coin.toUpperCase() + ', ';
          $localStorage['iguana-' + addCoinResponses[i].coin + '-passphrase'] = { 'logged': 'yes' };
        } else {
          failedCoinsOutput = failedCoinsOutput + addCoinResponses[i].coin.toUpperCase() + ', ';
        }
      }
      addedCoinsOutput = helper.trimComma(addedCoinsOutput);
      failedCoinsOutput = helper.trimComma(failedCoinsOutput);

      helper.prepMessageModal(addedCoinsOutput + ' ' + helper.lang('MESSAGE.COIN_ADD_P1') + (failedCoinsOutput.length > 7 ? failedCoinsOutput + ' ' + helper.lang('MESSAGE.COIN_ADD_P2') : ''), 'green', true);
    }

    /*
     *  receive coin modal
     */
    // TODO: directive
    // TODO(?): add syscoin:coinaddresshere?amount=0.10000000&label=123&message=123
    $scope.sendCoinKeying = function() { // !! ugly !!
      var coinRate,
          coin = $scope.activeCoin ? $scope.activeCoin : $localStorage['iguana-active-coin'] && $localStorage['iguana-active-coin'].id ? $localStorage['iguana-active-coin'].id : 0,
          currencyCoin = $('.currency-coin'),
          currencyObj = $('.currency');

      var localrates = JSON.parse(localstorage.getVal("iguana-rates" + coin.toUpperCase()));
      coinRate = helper.updateRates(coin, defaultCurrency, true);

      currencyCoin.on('keyup', function () {
        var calcAmount = $(this).val() * coinRate;
        currencyObj.val(calcAmount); // TODO: use decimals filter
      });

      currencyObj.on('keyup', function () {
        var calcAmount = $(this).val() / coinRate;
        currencyCoin.val(calcAmount); // TODO: use decimals filter
      });

      // ref: http://jsfiddle.net/dinopasic/a3dw74sz/
      // allow numeric only entry
      var currencyInput = $('.receiving-coin-content .currency-input input');
      currencyInput.keypress(function(event) {
        var inputCode = event.which,
            currentValue = $(this).val();
        if (inputCode > 0 && (inputCode < 48 || inputCode > 57)) {
          if (inputCode == 46) {
            if (helper.getCursorPositionInputElement($(this)) == 0 && currentValue.charAt(0) == '-') return false;
            if (currentValue.match(/[.]/)) return false;
          }
          else if (inputCode == 45) {
            if (currentValue.charAt(0) == '-') return false;
            if (helper.getCursorPositionInputElement($(this)) != 0) return false;
          }
          else if (inputCode == 8) return true;
          else return false;
        }
        else if (inputCode > 0 && (inputCode >= 48 && inputCode <= 57)) {
          if (currentValue.charAt(0) == '-' && helper.getCursorPositionInputElement($(this)) == 0) return false;
        }
      });
      currencyInput.keydown(function(event) {
        var keyCode = event.keyCode || event.which;

        if (keyCode === 189 || keyCode === 173 || keyCode === 109) { // disable "-" entry
          event.preventDefault();
        }
      });
    }

    $scope.getReceiveCoinAddress = function() {
      getReceiveCoinAddress();
    }

    function getReceiveCoinAddress() {
      var _activeCoin = $scope.activeCoin ? $scope.activeCoin : $localStorage['iguana-active-coin'] && $localStorage['iguana-active-coin'].id ? $localStorage['iguana-active-coin'].id : 0;
      var coinAccountAddress = api.getAccountAddress(_activeCoin, defaultAccount);

      $scope.receiveCoin.coinName = _activeCoin.toUpperCase();
      $scope.receiveCoin.currencyName = defaultCurrency.toUpperCase();
      $scope.receiveCoin.address = coinAccountAddress;
      $scope.receiveCoin.addressFormatted = $scope.receiveCoin.address.match(/.{1,4}/g).join(' ')
      $scope.receiveCoin.qrCode = $(kjua({ text: coinAccountAddress })).attr('src');
      $scope.receiveCoin.shareUrl = 'mailto:?subject=Here%20is%20my%20' + supportedCoinsList[_activeCoin].name + '%20address' +
                                    '&body=Hello,%20here%20is%20my%20' + supportedCoinsList[_activeCoin].name + '%20address%20' + coinAccountAddress;
    }

    $scope.copyToClipboard = function() {
      var temp = $('<input>');

      $('body').append(temp);
      //remove spaces from address
      temp.val($('#address').text().replace(/ /g, '')).select();

      try {
        helper.prepMessageModal(helper.lang('MESSAGE.ADDRESS_IS_COPIED'), 'blue', true);
        document.execCommand('copy');
      } catch(err) {
        helper.prepMessageModal(helper.lang('MESSAGE.COPY_PASTE_IS_NOT_SUPPORTED_ADDRESS'), 'red', true);
      }

      temp.remove();
    }

    /*
     *  send coin modal
     */
    $scope.sendCoin = {
      initStep: true,
      success: false,
      address: '',
      amount: 0,
      amountCurrency: 0,
      fee: 0,
      feeCurrency: 0,
      note: '',
      passphrase: ''
    };

    $scope.toggleSendCoinModal = function() {
      $scope.sendCoin.initStep = -$scope.sendCoin.initStep;
      $scope.sendCoin.currency = defaultCurrency;
      $scope.sendCoin.coinId = $scope.activeCoin.toUpperCase();
      $scope.sendCoin.coinValue = $scope.sideBarCoinsUnsorted[$scope.activeCoin].coinValue;
      $scope.sendCoin.currencyValue = $scope.sideBarCoinsUnsorted[$scope.activeCoin].currencyValue;
      $scope.sendCoin.currencyRate = helper.updateRates($scope.sendCoin.coinId, defaultCurrency, true);

      helper.toggleModalWindow('send-coin-form', 300);

      if (dev && dev.isDev && sendDataTest && sendDataTest[$scope.activeCoin]) {
        $scope.sendCoin.address = sendDataTest[$scope.activeCoin].address;
        $scope.sendCoin.amount = sendDataTest[$scope.activeCoin].amount;
        $scope.sendCoin.fee = 0.00001;
        $scope.sendCoin.note = sendDataTest[$scope.activeCoin].note;
      }
    }

    $scope.verifySendCoinForm = function() {
      // ref: http://jsfiddle.net/dinopasic/a3dw74sz/
      // allow numeric only entry
      var modalSendCoinClass = '.modal-send-coin';
      $(modalSendCoinClass + ' .tx-amount,' + modalSendCoinClass + ' .tx-amount-currency,' + modalSendCoinClass + ' .tx-fee,' + modalSendCoinClass + ' .tx-fee-currency').keypress(function (event) {
        var inputCode = event.which,
            currentValue = $(this).val();
        if (inputCode > 0 && (inputCode < 48 || inputCode > 57)) {
          if (inputCode == 46) {
            if (helper.getCursorPositionInputElement($(this)) == 0 && currentValue.charAt(0) == '-') return false;
            if (currentValue.match(/[.]/)) return false;
          }
          else if (inputCode == 45) {
            if (currentValue.charAt(0) == '-') return false;
            if (helper.getCursorPositionInputElement($(this)) != 0) return false;
          }
          else if (inputCode == 8) return true;
          else return false;
        }
        else if (inputCode > 0 && (inputCode >= 48 && inputCode <= 57)) {
          if (currentValue.charAt(0) == '-' && helper.getCursorPositionInputElement($(this)) == 0) return false;
        }
      });

      // calc on keying
      $(modalSendCoinClass + ' .tx-amount,' +
        modalSendCoinClass + ' .tx-amount-currency,' +
        modalSendCoinClass + ' .tx-fee,' +
        modalSendCoinClass + ' .tx-fee-currency').keydown(function(e) {
          var keyCode = e.keyCode || e.which;

          if (keyCode === 189 || keyCode === 173 || keyCode === 109) { // disable "-" entry
            e.preventDefault();
          }
      });
      $(modalSendCoinClass + ' .tx-amount').keyup(function(e) {
        txAmountFeeKeyupEvent(e, 'tx-amount', true, $(this).val());
      });
      $(modalSendCoinClass + ' .tx-amount-currency').keyup(function(e) {
        txAmountFeeKeyupEvent(e, 'tx-amount', false);
      });
      $(modalSendCoinClass + ' .tx-fee').keyup(function(e) {
        txAmountFeeKeyupEvent(e, 'tx-fee', true);
      });
      $(modalSendCoinClass + ' .tx-fee-currency').keyup(function(e) {
        txAmountFeeKeyupEvent(e, 'tx-fee', false);
      });

      function txAmountFeeKeyupEvent(evt, fieldName, type, val) {
        var keyCode = evt.keyCode || evt.which;

        if (keyCode !== 9) {
          var currentCoinRate = helper.updateRates($scope.sendCoin.coinId, defaultCurrency, true);

          var modalSendCoinField = modalSendCoinClass + ' .' + fieldName;
          if (type) {
            var fielValue = $(modalSendCoinField).val() * currentCoinRate;
            $(modalSendCoinField + '-currency').val(fieldValue); // TODO: use decimals filter
          } else {
            var fieldValue = $(modalSendCoinField + '-currency').val() / currentCoinRate;
            $(modalSendCoinField).val(fieldValue); // TODO: use decimals filter
          }
        } else {
          evt.preventDefault();
        }
      }
    }

    $scope.validateSendCoinForm = function() {
      if (validateSendCoinForm()) {
        $scope.sendCoin.amountCurrency = $scope.sendCoin.currencyRate * $scope.sendCoin.amount;
        $scope.sendCoin.feeCurrency = $scope.sendCoin.currencyRate * $scope.sendCoin.fee;
        $scope.sendCoin.initStep = false;
      }
    }

    // TODO: 1) coin address validity check e.g. btcd address cannot be used in bitcoin send tx
    //      1a) address byte prefix check
    function validateSendCoinForm() {
      var isValid = false,
          activeCoin = $('.account-coins-repeater .item.active').attr('data-coin-id'),
          coinData = $scope.activeCoin,
          activeCoinBalanceCoin = Number($('.account-coins-repeater .item.active .balance .coin-value .val').html()),
          activeCoinBalanceCurrency = Number($('.account-coins-repeater .item.active .balance .currency-value .val').html()),
          txAddressVal = $('.tx-address').val(),
          txAmountVal = $('.tx-amount').val(),
          txFeeVal = $('.tx-fee').val(),
          errorClassName = 'validation-field-error', // TODO: rename error class names
          errorClassName2 = 'col-red';

      // address
      var txAddressObj = $('.tx-address'),
          txAddressValidation = $('.tx-address-validation');
      if (txAddressVal.length !== 34) {
        txAddressObj.addClass(errorClassName);
        txAddressValidation.html(helper.lang('SEND.INCORRECT_ADDRESS')).
                            addClass(errorClassName2);
      } else {
        txAddressObj.removeClass(errorClassName);
        txAddressValidation.html(helper.lang('SEND.ENTER_A_WALLET_ADDRESS')).
                            removeClass(errorClassName2);
      }
      // coin amount
      var txAmountObj = $('.tx-amount'),
          txAmountCurrencyObj = $('.tx-amount-currency'),
          txAmountValidation = $('.tx-amount-validation'),
          coinName = $('.account-coins-repeater .item.active').attr('data-coin-id').toUpperCase();
      if (Number(txAmountVal) === 0 || !txAmountVal.length || txAmountVal > activeCoinBalanceCoin) {
        txAmountObj.addClass(errorClassName);
        txAmountCurrencyObj.addClass(errorClassName);
        txAmountValidation.html(Number(txAmountVal) === 0 || !txAmountVal.length ? helper.lang('SEND.PLEASE_ENTER_AN_AMOUNT') : helper.lang('SEND.NOT_ENOUGH_MONEY') + ' ' + activeCoinBalanceCoin + ' ' + coinName).
                           addClass(errorClassName2);
      } else {
        txAmountObj.removeClass(errorClassName);
        txAmountCurrencyObj.removeClass(errorClassName);
        txAmountValidation.html(helper.lang('RECEIVE.ENTER_IN') + ' ' + coinName + ' ' + helper.lang('LOGIN.OR') + ' ' + defaultCurrency.toUpperCase()).
                           removeClass(errorClassName2);
      }
      // fee
      var txFeeObj = $('.tx-fee'),
          txFeeCurrencyObj = $('.tx-fee-currency'),
          txFeeValidation = $('.tx-fee-validation');
      if ((Number(txFeeVal) + Number(txAmountVal)) > activeCoinBalanceCoin) {
        txFeeObj.addClass(errorClassName);
        txFeeCurrencyObj.addClass(errorClassName);
        txFeeValidation.html((activeCoinBalanceCoin - Number(txAmountVal)) > 0 ? helper.lang('SEND.FEE_CANNOT_EXCEED') + ' ' + (activeCoinBalanceCoin - Number(txAmountVal)) : helper.lang('SEND.TOTAL_AMOUNT_CANNOT_EXCEED') + ' ' + activeCoinBalanceCoin).
                        addClass(errorClassName2);
      }
      if (Number(txFeeVal) < (coinsInfo[$scope.activeCoin].relayFee || 0.00001)) { // TODO: settings
        txFeeObj.addClass(errorClassName);
        txFeeCurrencyObj.addClass(errorClassName);
        txFeeValidation.html((coinsInfo[$scope.activeCoin].relayFee || 0.00001) + ' ' + helper.lang('SEND.IS_A_MIN_REQUIRED_FEE')).
                        addClass(errorClassName2);
      }
      if ((Number(txFeeVal) >= (coinsInfo[$scope.activeCoin].relayFee || 0.00001)) && (Number(txFeeVal) + Number(txAmountVal)) < activeCoinBalanceCoin)  {
        txFeeObj.removeClass(errorClassName);
        txFeeCurrencyObj.removeClass(errorClassName);
        txFeeValidation.html(helper.lang('SEND.MINIMUM_FEE')).
                        removeClass(errorClassName2);
      }

      if (txAddressVal.length !== 34 ||
          Number(txAmountVal) === 0 ||
          !txAmountVal.length ||
          txAmountVal > activeCoinBalanceCoin ||
          Number(txFeeVal + txAmountVal) > activeCoinBalanceCoin) {
        isValid = false;
      } else {
        isValid = true;
      }

      return isValid;
    }

    $scope.sendCoinFormConfirm = function() {
      if (!isIguana) {
        helper.toggleModalWindow('send-coin-confirm-passphrase', 300);
        // dev only
        if (dev.isDev && !isIguana && dev.coinPW.coind[$scope.activeCoin]) $scope.sendCoin.passphrase = dev.coinPW.coind[$scope.activeCoin];
        if (dev.isDev && isIguana && dev.coinPW.iguana) $scope.sendCoin.passphrase = dev.coinPW.iguana;
      } else {
        execSendCoinCall();
      }
    }

    $scope.confirmSendCoinPassphrase = function() {
      var coindWalletLogin = api.walletLogin($scope.sendCoin.passphrase, settings.defaultWalletUnlockPeriod, $scope.activeCoin);

      if (coindWalletLogin !== -14) {
        helper.toggleModalWindow('send-coin-confirm-passphrase', 300);
        execSendCoinCall();
      } else {
        helper.prepMessageModal(helper.lang('MESSAGE.WRONG_PASSPHRASE'), 'red', true);
      }
    }

    function execSendCoinCall() {
      var setTxFeeResult = false,
          txDataToSend = {
            address: $scope.sendCoin.address,
            amount: $scope.sendCoin.amount,
            note: $scope.sendCoin.note
          };

      if (Number($scope.sendCoin.fee) !== Number(coinsInfo[$scope.activeCoin].relayFee) && Number($scope.sendCoin.fee) !== 0.00001 && Number($scope.sendCoin.fee) !== 0) {
        setTxFeeResult = api.setTxFee($scope.activeCoin, sendFormDataCopy.fee);
      }

      var sendTxResult = api.sendToAddress($scope.activeCoin, txDataToSend);

      if (sendTxResult.length === 64) {
        $scope.sendCoin.success = true;
      } else {
        // go to an error step
        helper.prepMessageModal(helper.lang('MESSAGE.TRANSACTION_ERROR'), 'red', true);
      }

      // revert pay fee
      if (setTxFeeResult) api.setTxFee($scope.activeCoin, 0);
    }

    function initTopNavBar() {
      if ($(window).width() < 768) {
        var topMenu = $('#top-menu'),
            btnLeft = $('.nav-buttons .nav-left', topMenu),
            btnRight = $('.nav-buttons .nav-right', topMenu),
            items = $('.item', topMenu), itemsLength = 0, item;

        btnLeft.on('click swipeleft', function() {
          if ($(window).width() < $('.top-menu', topMenu).width()) {
            itemsLength = $('.top-menu', topMenu).width();
            for (var i = items.length - 1; 0 <= i; i--) {
              item = $(items[i]);
              itemsLength -= $(items[i]).width();
              if ($(items[i]).offset().left + $(items[i]).width() < $('.top-menu', topMenu).width() && itemsLength > $(items[i]).width()) {
                item.closest('.navbar-nav').animate({'margin-left':
                parseFloat(item.closest('.navbar-nav').css('margin-left')) + $(items[i]).width()}, "slow");
                itemsLength = 0;
                break;
              } else {
                return;
              }
            }
          }
        });
        btnRight.on('click swiperight', function() {
          if ($(window).width() < $('.top-menu', topMenu).width())
            for (var i = 0; items.length > i; i++) {
              item = $(items[i]);
              itemsLength += $(items[i]).offset().left;
              if ($(items[i]).offset().left < topMenu.width() && itemsLength > topMenu.width()) {
                item.closest('.navbar-nav').animate({'margin-left':
                  (parseFloat(item.closest('.navbar-nav').css('margin-left')) - $(items[i]).width())}, "slow");
                itemsLength = 0;
                break;
              }
            }
        });
      }
    }
}]);
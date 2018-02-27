"use strict";
function ProWorker(account)
{
  this.worker = new Worker('worker.js')
  this.account = account
  this.mhandlers = {}
  var pw = this
  this.worker.onmessage = function(msg)
  {
    for (let i in pw.mhandlers[msg.data.name])
      pw.mhandlers[msg.data.name][i](msg.data.msg)
  }
}

ProWorker.prototype.refresh_account = function(account){
  this.account = account
}

ProWorker.prototype.connect = function (mname, mcallback)
{
  if (! $.isArray(this.mhandlers[mname]))
    this.mhandlers[mname] = []
  if ($.inArray(mcallback, this.mhandlers[mname]) == -1)
    this.mhandlers[mname].push(mcallback)
}

ProWorker.prototype.disconnect = function (mname, mcallback)
{
  if (! $.isArray(this.mhandlers[mname]))
    this.mhandlers[mname] = []
  if (typeof mcallback == "number")
    this.mhandlers[mname].splice(mcallback, 0)
  else if ($.inArray(mcallback, this.mhandlers[mname]) == -1)
    this.mhandlers[mname] = this.mhandlers[mname]
      .filter(function(e){return (e != mcallback)})
}

ProWorker.prototype.connectOneShot = function (mname, mcallback)
{
  var pw = this
  let oneshotcb = function(data){
    mcallback(data)
    pw.disconnect(oneshotcb)
  }
  this.connect(mname, oneshotcb)
}

ProWorker.prototype.justSend = function (name, msg)
{
  this.worker.postMessage({name: name, account: this.account, msg: msg})
}

ProWorker.prototype.send = function (name, msg)
{
  var pw = this
  return new Promise(function(ok, fail){
    pw.connectOneShot(name, ok)
    pw.justSend(name, msg)
  })
}

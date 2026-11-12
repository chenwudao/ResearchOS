/* Three-way merge of independent edits from the UI, tools and other tabs. */
(function (root) {
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function merge(base, local, remote, path='') {
    if(equal(local,base))return remote;
    if(equal(remote,base)||equal(local,remote))return local;
    if(path==='state.ui')return local;
    if(/\.(updatedAt|updated)$/.test(path) && typeof local==='string' && typeof remote==='string')return local>remote?local:remote;
    if([base,local,remote].every(Array.isArray) &&
       [...base,...local,...remote].every(x=>x && typeof x==='object' && typeof x.id==='string')) {
      const maps=[base,local,remote].map(a=>new Map(a.map(x=>[x.id,x])));
      const ids=[...new Set([...remote,...local].map(x=>x.id))];
      return ids.map(id=>merge(maps[0].get(id),maps[1].get(id),maps[2].get(id),path+'.'+id)).filter(x=>x!==undefined);
    }
    if([local,remote].every(x=>x && typeof x==='object' && !Array.isArray(x)) &&
       (base===undefined || base && typeof base==='object' && !Array.isArray(base))) {
      const result={};
      for(const key of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])) {
        const value=merge(base?.[key],local[key],remote[key],path?path+'.'+key:key);
        if(value!==undefined)result[key]=value;
      }
      return result;
    }
    throw Error('同一条内容发生并发修改，请保留当前草稿后刷新：'+path);
  }
  root.mergeWorkspace=merge;
  if(typeof module!=='undefined')module.exports=merge;
})(typeof window==='undefined'?globalThis:window);

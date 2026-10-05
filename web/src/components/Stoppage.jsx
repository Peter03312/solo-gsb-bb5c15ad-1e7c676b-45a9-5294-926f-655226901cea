import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { fmtTime } from './Results.jsx';

/** 客户端合并区间并集（与后端 mergeIntervals 同语义），用于实时预览重叠合并 */
function mergeIntervals(list) {
  const valid = list
    .map(iv => ({ start: Number(iv.startSecs), end: Number(iv.endSecs) }))
    .filter(iv => Number.isInteger(iv.start) && Number.isInteger(iv.end) && iv.start >= 0 && iv.end > iv.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const iv of valid) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else merged.push({ ...iv });
  }
  return merged;
}

const totalOf = list => list.reduce((s, iv) => s + (iv.end - iv.start), 0);

export default function Stoppage({ event, onChanged, onError }) {
  // 表单区间（字符串输入，失焦/保存时再校验）
  const [rows, setRows] = useState([]);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (event?.configured) {
      setRows((event.stoppages || []).map(iv => ({ startSecs: String(iv.startSecs), endSecs: String(iv.endSecs) })));
    }
  }, [event]);

  const numeric = useMemo(
    () => rows.map(iv => ({ startSecs: Number(iv.startSecs), endSecs: Number(iv.endSecs) })),
    [rows]
  );
  const merged = useMemo(() => mergeIntervals(numeric), [numeric]);
  const rawTotal = useMemo(
    () =>
      numeric
        .filter(iv => Number.isInteger(iv.startSecs) && Number.isInteger(iv.endSecs) && iv.startSecs >= 0 && iv.endSecs > iv.startSecs)
        .reduce((s, iv) => s + (iv.endSecs - iv.startSecs), 0),
    [numeric]
  );

  const patch = (i, key, val) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  const addRow = () => setRows(rs => [...rs, { startSecs: '', endSecs: '' }]);
  const removeRow = i => setRows(rs => rs.filter((_, j) => j !== i));

  const submit = async e => {
    e.preventDefault();
    setSaved(false);
    for (let i = 0; i < rows.length; i++) {
      const iv = rows[i];
      const s = Number(iv.startSecs);
      const t = Number(iv.endSecs);
      if (!Number.isInteger(s) || s < 0) return onError(new Error(`第 ${i + 1} 个区间：起点须为非负整数`));
      if (!Number.isInteger(t) || t < 0) return onError(new Error(`第 ${i + 1} 个区间：终点须为非负整数`));
      if (!(s < t)) return onError(new Error(`第 ${i + 1} 个区间：起点须小于终点`));
    }
    setBusy(true);
    try {
      const intervals = rows.map(iv => ({ startSecs: Number(iv.startSecs), endSecs: Number(iv.endSecs) }));
      const r = await api.saveStoppages({ expectedRevision: event?.revision ?? 0, intervals });
      setSaved(true);
      setNote(r.changed ? '' : '停表区间与现有并集一致，未变更（幂等）');
      await onChanged();
      setTimeout(() => { setSaved(false); setNote(''); }, 2500);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!event?.configured) return <p className="muted">请先配置赛事。</p>;

  return (
    <form onSubmit={submit} className="panel">
      <h2>统一停表区间</h2>
      <p className="muted small">
        赛事因天气等原因统一停表时，按<b>距发枪秒数</b>登记停表区间 <b>[起点, 终点)</b>：起止均为非负整数且起点小于终点，
        可登记多段、允许<b>相互重叠</b>（核算时按并集只计一次）。完成者的<b>净耗时 = 原始耗时 −
        停表并集与其「出发→终点」区间的交长</b>，排名与并列按<b>净耗时</b>；关卡/终点截止与有效链仍按原始秒数判定，
        未完赛者无净耗时。保存需携带当前修订号，过期将返回 409；任一区间非法则<b>整次拒绝</b>。
        发布版会冻结当时的停表区间与净耗时，后续调整不影响历史版。
      </p>

      <table className="grid compact">
        <thead>
          <tr><th style={{ width: 60 }}>序号</th><th>起点（距发枪秒）</th><th>终点（距发枪秒）</th><th>时长</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><input type="number" min="0" value={r.startSecs} onChange={e => patch(i, 'startSecs', e.target.value)} style={{ width: 140 }} /></td>
              <td><input type="number" min="0" value={r.endSecs} onChange={e => patch(i, 'endSecs', e.target.value)} style={{ width: 140 }} /></td>
              <td className="small muted">
                {Number.isInteger(Number(r.startSecs)) && Number.isInteger(Number(r.endSecs)) &&
                 Number(r.startSecs) >= 0 && Number(r.endSecs) > Number(r.startSecs)
                  ? `${Number(r.endSecs) - Number(r.startSecs)}s（${fmtTime(Number(r.endSecs) - Number(r.startSecs))}）`
                  : '—'}
              </td>
              <td><button type="button" className="btn small danger" onClick={() => removeRow(i)}>删除</button></td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan="5" className="muted">当前无停表区间（清空后保存即删除全部）。</td></tr>
          )}
        </tbody>
      </table>
      <button type="button" className="btn" onClick={addRow}>+ 添加停表区间</button>

      <h3>并集预览（重叠只计一次）</h3>
      {merged.length > 0 ? (
        <>
          <div className="chain">
            {merged.map((iv, i) => (
              <span className="chip" key={i}>{iv.start}s ~ {iv.end}s<small>{iv.end - iv.start}s · {fmtTime(iv.start)}~{fmtTime(iv.end)}</small></span>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            登记总时长 {rawTotal}s，去重合并后停表共 <b>{totalOf(merged)}s</b>
            （重叠部分 {rawTotal - totalOf(merged)}s 只计一次）。
          </p>
        </>
      ) : (
        <p className="muted small">无有效区间（存在非法输入或列表为空）。</p>
      )}

      <div className="actions">
        <button className="btn primary" type="submit" disabled={busy}>
          保存停表区间（基于修订 #{event?.revision ?? 0}）
        </button>
        {saved && <span className="ok-text">已保存</span>}
        {note && <span className="muted small">{note}</span>}
      </div>
    </form>
  );
}

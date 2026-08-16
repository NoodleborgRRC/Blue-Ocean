function useState(init){ return [typeof init==='function'?init():init, ()=>{}]; }
function useEffect(){}
function useRef(init){ return {current: init}; }
function createElement(){ return null; }
const Fragment = 'Fragment';
module.exports = { useState, useEffect, useRef, createElement, Fragment, default: { useState, useEffect, useRef, createElement, Fragment } };

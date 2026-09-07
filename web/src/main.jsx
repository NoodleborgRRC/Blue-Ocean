import './install-storage.js'; // must stay first — see that file
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import Game from '@core';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Game />
  </React.StrictMode>
);

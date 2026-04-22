(() => {
  const sheetId = "1kP8Iwh5lCnEGvVxLP1vxCy0mJWO34BW9FKBg4ZSXAf8";
  const apiKey  = "AIzaSyAwe-nAyIphZ47DgK5din3JoqADod5sVLk";
  const range   = "Sheet1!A:M";

  let cachedData = null;

  let lastResult = null;
  let lastRecord = null;

  const headers = [
    "Serial no.","Date","Name","City","Item","Amount",
    "ਖਾਲਸ ਸੋਨਾ","Int.","ਹੋਰ","P.Pmt","Notes","Ph. No","Taken"
  ];

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function parseAmount(val) {
    return Number(String(val).replace(/[^\d]/g, "")) || 0;
  }

  function parseRate(val) {
    return Number(String(val).replace(/[^\d.]/g, "")) || 0;
  }

  function parseDate(dateStr) {
    if (!dateStr) return null;

    const cleaned = String(dateStr).replace(/[()]/g, "");
    const parts = cleaned.split(/[.\-/]/);

    if (parts.length !== 3) return null;

    let [d, m, y] = parts.map(Number);

    if (y < 100) {
      y = y > 50 ? 1900 + y : 2000 + y;
    }

    return new Date(y, m - 1, d);
  }

  function formatDate(date) {
    return date.toLocaleDateString("en-GB");
  }

  function parseEntries(text) {
    if (!text || text === "—") return [];

    const results = [];
    const regex = /([\d,]+)[^\(]*\(([^)]+)\)/g;

    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push({
        amount: Number(match[1].replace(/,/g, "")),
        date: match[2]
      });
    }

    return results;
  }

  function calculateMonths(start, end) {
    let months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());

    let anchor = new Date(start);
    anchor.setMonth(anchor.getMonth() + months);

    if (anchor > end) {
      months--;
      anchor = new Date(start);
      anchor.setMonth(anchor.getMonth() + months);
    }

    const extraDays = Math.floor((end - anchor) / (1000 * 60 * 60 * 24));

    if (extraDays <= 4) return months;
    if (extraDays <= 15) return months + 0.5;
    return months + 1;
  }

  function calculateFull(record) {
    const principal = parseAmount(record["Amount"]);
    const rate = parseRate(record["Int."]);
    const startDate = parseDate(record["Date"]);

    const payments = parseEntries(record["P.Pmt"]).map(p => ({ ...p, type: "payment" }));
    const extras = parseEntries(record["ਹੋਰ"]).map(e => ({ ...e, type: "extra" }));

    if (!principal || !rate || !startDate) return null;

    let currentAmount = principal;
    let currentDate = startDate;
    let totalInterest = 0;

    const steps = [];

    steps.push({ type: "start", amount: currentAmount });

    const events = [...payments, ...extras].sort(
      (a, b) => parseDate(a.date) - parseDate(b.date)
    );

    events.forEach(e => {
      const eventDate = parseDate(e.date);

      let months;

      // 🔥 FIX: FIRST PERIOD ALWAYS FULL MONTH
      if (currentDate.getTime() === startDate.getTime()) {
        months = 1;
      } else {
        months = calculateMonths(currentDate, eventDate);
      }

      const monthlyInterest = currentAmount * rate / 100;
      const interest = monthlyInterest * months;

      if (months > 0) {
        steps.push({
          type: "interest",
          from: currentDate,
          to: eventDate,
          base: currentAmount,
          rate,
          months,
          interest,
          after: currentAmount + interest
        });

        currentAmount += interest;
        totalInterest += interest;
      }

      if (e.type === "payment") {
        currentAmount -= e.amount;
        steps.push({ type: "payment", date: eventDate, amount: e.amount, after: currentAmount });
      } else {
        currentAmount += e.amount;
        steps.push({ type: "extra", date: eventDate, amount: e.amount, after: currentAmount });
      }

      currentDate = eventDate;
    });

    let months;

    // 🔥 FIX: NO EVENT CASE → STILL FIRST PERIOD
    if (currentDate.getTime() === startDate.getTime()) {
      months = 1;
    } else {
      months = calculateMonths(currentDate, new Date());
    }

    const monthlyInterest = currentAmount * rate / 100;
    const interest = monthlyInterest * months;

    steps.push({
      type: "interest",
      from: currentDate,
      to: new Date(),
      base: currentAmount,
      rate,
      months,
      interest,
      after: currentAmount + interest
    });

    currentAmount += interest;
    totalInterest += interest;

    return { totalInterest, finalAmount: currentAmount, steps };
  }

  function cleanPhoneNumber(phone) {
    if (!phone) return "";
    let digits = String(phone).replace(/\D/g, "");
    digits = digits.replace(/^0+/, "");

    if (digits.length === 12 && digits.startsWith("91")) return digits;
    if (digits.length === 10) return "91" + digits;
    if (digits.length > 10) return "91" + digits.slice(-10);

    return "";
  }

  function sendWhatsApp(record, result) {
    const phone = cleanPhoneNumber(record["Ph. No"]);

    if (!phone) {
      alert("Invalid phone number");
      return;
    }

    const message = `
BK Jewellers

Name: ${record["Name"]}
Item: ${record["Item"]}

Loan: ₹${Math.round(result.finalAmount - result.totalInterest)}
Interest: ₹${Math.round(result.totalInterest)}
Total: ₹${Math.round(result.finalAmount)}

Thank you 🙏
    `;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  window.showInterest = function(record) {
    const modal = document.getElementById("ppModal");
    const content = document.getElementById("ppContent");

    const result = calculateFull(record);

    lastResult = result;
    lastRecord = record;

    if (!result) {
      content.innerHTML = "Invalid data";
      modal.style.display = "flex";
      return;
    }

    let html = `<h3>Detailed Ledger</h3>`;

    result.steps.forEach(step => {
      if (step.type === "start") {
        html += `<div class="pp-item"><b>Start</b><span>₹${Math.round(step.amount)}</span></div>`;
      }

      if (step.type === "interest") {
        html += `
          <div class="pp-item">
            <span>${formatDate(step.from)} → ${formatDate(step.to)}<br>
            ₹${Math.round(step.base)} @ ${step.rate}% × ${step.months} months</span>
            <span>+₹${Math.round(step.interest)}</span>
          </div>
        `;
      }

      if (step.type === "payment") {
        html += `<div class="pp-item"><span>Payment (${formatDate(step.date)})</span><span>-₹${step.amount}</span></div>`;
      }

      if (step.type === "extra") {
        html += `<div class="pp-item"><span>Extra (${formatDate(step.date)})</span><span>+₹${step.amount}</span></div>`;
      }
    });

    html += `<hr>
      <div class="pp-item"><b>Total Interest</b><span>₹${Math.round(result.totalInterest)}</span></div>
      <div class="pp-item"><b>Final Amount</b><span>₹${Math.round(result.finalAmount)}</span></div>
    `;

    html += `
      <div style="margin-top:15px; display:flex; gap:10px;">
        <button class="pp-btn" id="waSend">Send WhatsApp</button>
      </div>
    `;

    content.innerHTML = html;
    modal.style.display = "flex";

    document.getElementById("waSend").onclick = () => {
      sendWhatsApp(lastRecord, lastResult);
    };
  };

  function fetchRecord(serialInput) {
    const resultDiv = document.getElementById("result");

    if (!cachedData) {
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`)
        .then(res => res.json())
        .then(data => {
          cachedData = data;
          process(serialInput);
        });
    } else {
      process(serialInput);
    }

    function process(serialInput) {
      const rows = cachedData.values.slice(1);

      const index = rows.findIndex(r => String(r[0]).trim() === serialInput.trim());

      if (index === -1) {
        resultDiv.innerHTML = "No record";
        return;
      }

      const raw = rows[index];

      const record = {};
      headers.forEach((h, i) => {
        record[h] = raw[i] || "";
      });

      let html = `<div class="record-card"><div class="fields-grid">`;

      headers.forEach(h => {
        html += `
          <div class="field">
            <div class="label">${h}</div>
            <div class="value">${escapeHtml(record[h])}</div>
          </div>
        `;
      });

      html += `
        <div class="field important">
          <button class="pp-btn" id="calcBtn">Calculate Interest</button>
        </div>
      `;

      html += `</div></div>`;
      resultDiv.innerHTML = html;

      document.getElementById("calcBtn").onclick = () => {
        showInterest(record);
      };
    }
  }

  function init() {
    const form = document.getElementById("searchForm");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      fetchRecord(document.getElementById("serialInput").value);
    });

    document.getElementById("closeModal").onclick = () => {
      document.getElementById("ppModal").style.display = "none";
    };

    window.onclick = (e) => {
      if (e.target.id === "ppModal") {
        document.getElementById("ppModal").style.display = "none";
      }
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
import { parseMd } from "./src/lib/budaya/md-parser";

// Test based on sample files
const test = `1_Trenggiling, Sariyoso Kec/Kab: Wonosobo
(Romb Trenggono Sari Budoyo)

2_Siyono, Bojasari Kec: Kertek Kab: Wonosobo
(Romb Rukun Santoso)

3_Kliwonan, Karangluhur Kec: Kertek Kab: Wonosobo
(Romb Budoyo Luhur)

4_Bendo, Purwojati Kec: Kertek Kab: Wonosobo
(Romb Rukun Muda)

5_Sambon, Sumberdalem Kec: Kertek Kab: Wonosobo
(Romb Sumber Budaya)

6_Ngabean, Maduretno Kec: Kalikajar Kab: Wonosobo
(Romb Langgeng Sari)

7_Susukan, Tegalombo Kec: Kalikajar Kab: Wonosobo
(Romb Wahyu Cipto Turonggo)

8_Mungkung Kec: Kalikajar Kab: Wonosobo
(Romb Langgeng Budoyo)

9_Sumpet Kec: Kepil Kab: Wonosobo
(Romb Rukun Santoso, Candiroto, Candimulyo Kec: Kertek Kab: Wonosobo)

10_Diwek, Kaliputih Kec: Selomerto Kab: Wonosobo
(Romb Laras Budaya, Cledok Wetan, Cledok Kec: Kaliwiro Kab: Wonosobo)

11_Pucung Rubuh Kec: Leksono Kab: Wonosobo
(Romb Putra Asmara Budaya)

12_Gombangsari, Jonggolsari Kec: Leksono Kab: Wonosobo
(Romb Krida Budaya)

13_Pangempon, Kemiriombo Kec: Kaliwiro Kab: Wonosobo
(Romb Karya Remaja)

14_Kaliori, Pesodongan Kec: Kaliwiro Kab: Wonosobo
(Romb Krida Budaya Manunggal Sejati)

15_Limbangan, Tirip Kec: Wadaslintang Kab: Wonosobo
(Romb Wiromo Sari Budoyo)

16_Dk. Karangsambung, Ds. Jebengan, Trimulyo Kec: Wadaslintang Kab: Wonosobo
(Romb Kusuma Budaya)

17_Brahol, Durensawit Kec: Leksono Kab: Wonosobo
"TAYUB"

18_Pencil, Lamuk Kec: Kalikajar Kab: Wonosobo
(Romb Setiya Jati, Wonokriyo)
"JARANAN & WAROK"

19_Halaman Terminal Kalibeber Kec: Mojotengah Kab: Wonosobo
(Romb Manunggal Budoyo, Temanggung)
"WAROK"

20_Lapangan Desa Kejajar Kec: Kejajar Kab: Wonosobo
(Romb Tirto Suro)
"TOPENG IRENG & WAROK"`;

console.log("=== Test Location Parsing ===\n");

const result = parseMd(test);
result.rows.forEach((row, i) => {
  const lines = test.split('\n');
  const headerLine = lines[i * 4]; // Each case is 4 lines
  console.log(`Case ${i+1}: ${headerLine?.replace(/^\d+_/, '').split(',')[0] || 'Unknown'}`);
  console.log(`  Lokasi: ${row.Lokasi}`);
  console.log(`  Dusun: ${row["nama_dusun/kampung"]}`);
  console.log(`  Desa: ${row["nama_desa/Kelurahan"]}`);
  console.log(`  Kec: ${row.Nama_Kecamatan}`);
  console.log(`  Kab: ${row.nama_kabupaten}`);
  console.log("---");
});

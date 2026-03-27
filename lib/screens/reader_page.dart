import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'dart:io' as io;
import 'package:universal_html/html.dart' as html;

class ReaderPage extends StatefulWidget {
  final PlatformFile epubFile;
  const ReaderPage({Key? key, required this.epubFile}) : super(key: key);

  @override
  State<ReaderPage> createState() => _ReaderPageState();
}

class _ReaderPageState extends State<ReaderPage> {
  late WebViewController _controller;
  bool _isWebViewReady = false;
  bool _isBookReady = false;

  String _currentTime = '';
  Timer? _timer;

  double _readingProgress = 0.0;
  String _currentCfi = '';
  String _estimatedTimeLeft = "Calcolo...";
  List<double> _chapterMarks = [];

  @override
  void initState() {
    super.initState();
    _startClock();
    _initWebView();
  }

  void _startClock() {
    _updateTime();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) => _updateTime());
  }

  void _updateTime() {
    setState(() => _currentTime = DateFormat('HH:mm').format(DateTime.now()));
  }

  Future<Uint8List> _getEpubBytes() async {
    if (kIsWeb) return widget.epubFile.bytes!;
    return await io.File(widget.epubFile.path!).readAsBytes();
  }

  Future<void> _initWebView() async {
    _controller = WebViewController();

    // 1. Configurazioni per Mobile (Android/iOS)
    if (!kIsWeb) {
      _controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      _controller.setBackgroundColor(Colors.white);
      _controller.addJavaScriptChannel(
        'FlutterChannel',
        onMessageReceived: (JavaScriptMessage message) => _handleJavascriptMessage(message.message),
      );
    } else {
      // 2. Ascoltatore Nativo Universale per il Web
      html.window.onMessage.listen((event) {
        if (event.data is String) {
          final msg = event.data as String;
          // Ascoltiamo 'cfi', 'ready' ed 'error'
          if (msg.contains('cfi') || msg.contains('ready') || msg.contains('error')) {
            _handleJavascriptMessage(msg);
          }
        }
      });
    }

    // 3. Prepariamo il file e la posizione
    final Uint8List epubBytes = await _getEpubBytes();
    final String base64Epub = base64Encode(epubBytes);

    final prefs = await SharedPreferences.getInstance();
    final savedCfi = prefs.getString('bookmark_${widget.epubFile.name}') ?? '';

    // 4. Iniettiamo nel file HTML
    String htmlContent = await rootBundle.loadString('assets/index.html');
    htmlContent = htmlContent.replaceFirst('"FLUTTER_BASE64"', '"$base64Epub"');
    htmlContent = htmlContent.replaceFirst('"FLUTTER_CFI"', '"$savedCfi"');

    await _controller.loadHtmlString(htmlContent);

    setState(() => _isWebViewReady = true);
  }

// --- FUNZIONE CHE ASCOLTA IL JS ---
  void _handleJavascriptMessage(String message) {
    try {
      final data = jsonDecode(message);

      print(data);

      if (data['event'] == 'ready') {
        setState(() => _isBookReady = true);
        return;
      }

      // Il JS ha finito di mappare il libro e ci invia la posizione dei capitoli
      if (data['event'] == 'marks_ready') {
        setState(() {
          if (data['marks'] != null) {
            _chapterMarks = List<double>.from(data['marks'].map((x) => (x as num).toDouble()));
          }
        });
        return;
      }

      if (data['event'] == 'relocated') {
        setState(() {
          _currentCfi = data['cfi'] ?? '';

          if (data['bookProgress'] != null) {
            _readingProgress = (data['bookProgress'] as num).toDouble();
          }

          if (data['minutesLeft'] != null) {
            int mins = (data['minutesLeft'] as num).toInt();
            _estimatedTimeLeft = mins < 1 ? "< 1 min" : "~$mins min";
          }
        });
        _saveBookmark();
      }
    } catch (e) {
      if (kDebugMode) print("Errore JS: $e");
    }
  }

  Future<void> _saveBookmark() async {
    if (_currentCfi.isNotEmpty) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('bookmark_${widget.epubFile.name}', _currentCfi);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            // --- TOP BAR ---
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: IconButton(
                      icon: const Icon(Icons.arrow_back, color: Colors.black54),
                      onPressed: () {
                        _saveBookmark();
                        Navigator.pop(context);
                      },
                    ),
                  ),
                  Text(_currentTime, style: const TextStyle(fontSize: 14, color: Colors.black54, fontWeight: FontWeight.bold)),
                ],
              ),
            ),

            // --- AREA WEBVIEW ---
            Expanded(
              child: Stack(
                children: [
                  if (_isWebViewReady) WebViewWidget(controller: _controller),

                  if (!_isBookReady)
                    Container(
                      color: Colors.white,
                      child: const Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            CircularProgressIndicator(color: Colors.black),
                            SizedBox(height: 16),
                            Text("Impaginazione del libro...", style: TextStyle(color: Colors.grey)),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),

            // --- BOTTOM BAR ---
            Container(
              color: Colors.white,
              padding: const EdgeInsets.only(bottom: 16.0, top: 8.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Progress Bar con le Tacche dei capitoli
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                    child: LayoutBuilder(
                        builder: (context, constraints) {
                          return SizedBox(
                            height: 12,
                            width: constraints.maxWidth,
                            child: Stack(
                              alignment: Alignment.centerLeft,
                              children: [
                                SizedBox(
                                  width: constraints.maxWidth,
                                  child: LinearProgressIndicator(
                                    value: _readingProgress,
                                    backgroundColor: Colors.grey[200],
                                    color: Colors.black87,
                                    minHeight: 4,
                                  ),
                                ),
                                // Disegna i segmenti (le tacche) dei capitoli
                                ..._chapterMarks.map((mark) {
                                  return Positioned(
                                    left: constraints.maxWidth * mark,
                                    child: Container(
                                      width: 1.5,
                                      height: 12,
                                      color: Colors.red, // Colore della tacca
                                    ),
                                  );
                                }).toList(),
                              ],
                            ),
                          );
                        }
                    ),
                  ),

                  // Testi Informativi
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        // Tempo Rimanente alla fine del capitolo (Dinamico!)
                        Text(
                          'Fine cap: $_estimatedTimeLeft',
                          style: const TextStyle(fontSize: 13, color: Colors.black54),
                        ),

                        // Percentuale TOTALE del libro
                        Text(
                          '${(_readingProgress * 100).toStringAsFixed(1)}%',
                          style: const TextStyle(fontSize: 13, color: Colors.black87, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _saveBookmark();
    super.dispose();
  }
}
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:librain/screens/home_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const KindleCloneApp());
}

class KindleCloneApp extends StatelessWidget {
  const KindleCloneApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'E-Reader Pro',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.light,
        scaffoldBackgroundColor: Colors.white,
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: Colors.black,
          elevation: 1, // Bassa elevazione per un look piatto
        ),
        useMaterial3: true,
      ),
      home: HomePage(),
    );
  }
}

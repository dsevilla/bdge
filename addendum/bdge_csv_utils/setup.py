from setuptools import setup, find_packages

setup(
    name='bdge_csv_utils',
    version='0.1.0',
    packages=find_packages(include=[
        'bdge_csv_utils',
        'bdge_csv_utils.csv_schema',
        'bdge_csv_utils.csv_schema.*',
        'bdge_csv_utils.mongo_utils',
        'bdge_csv_utils.mongo_utils.*',
    ]),
    install_requires=[],
    url='https://github.com/dsevilla/bdge/addendum/bdge_csv_utils',
    author='Your Name',
    author_email='your.email@example.com',
    description='Utilities for CSV processing in the bdge project',
    classifiers=[
        'Programming Language :: Python :: 3',
        'License :: OSI Approved :: MIT License',
        'Operating System :: OS Independent',
    ],
    python_requires='>=3.12',
)
